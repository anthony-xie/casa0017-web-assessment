import { AppError } from "./error.js";

//Function to call the Postcode.io API to get the latitude and longitude of the postcodes
export async function getGeoCode(postcodes) {

    const response = await fetchUpstream("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({postcodes: postcodes}),
        redirect: "follow"
        },
        "Postcodes.io API"
    );

    if (!response.ok) {
        throw new AppError(`Failed to get geocode for postcodes: ${response.status}`, 502);
    }

    const geoCodes = await response.json();

    //Check if any of the postcodes could not be identified
    if (geoCodes.result.some(item => item === null || item.result === null)) {
        throw new AppError("One or more postcodes could not be identified", 422);
    }

    //Check if any of the postcodes are outside of London
    if (geoCodes.result.some(item => item.result.region !== "London")) {
        throw new AppError("One or more postcodes are outside of London", 422);
    }

    return geoCodes.result.map(item => ({
        postcode: item.query,
        latitude: item.result.latitude,
        longitude: item.result.longitude
    }));
}

//Function to call the TFL Journey Planner API
export async function getJourneyPlan(from, to) {
    //encodeURIComponent 
    const url = new URL(`https://api.tfl.gov.uk/Journey/JourneyResults/${from}/to/${to}`);
    const apiKey = process.env.TFL_API_KEY;
    if(!apiKey){
        throw new AppError('Missing TfL API Key', 500);
    }
    url.searchParams.set('app_key', apiKey);

    const response = await fetchUpstream(url, {
        method: "GET",
        headers: { Accept: 'application/json' }
        },
        "Journey Planner API"
    );

    //Returns null when there are no routes between two points
    if(response.status === 404){
        return null;
    }

    if (!response.ok){
        throw new AppError(`TfL Journey Planner API request failed: ${response.status} ${response.statusText}`, 502);
    }

    const data = await response.json();

    //An empty ok response also means that there are no routes between two points
    if (!data.journeys || data.journeys.length === 0){
        return null;
    }

    return data;
}

//Helper function to check for network failures when connecting to APIs
async function fetchUpstream(url, options, api) {
    try {
        //cancels the request after 15 seconds
        return await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    } catch (err) {
        if (err.name === 'TimeoutError') {
            throw new AppError(`${api} took too long to respond`, 504);
        }
        throw new AppError(`${api} is unavailable`, 502);
    }
}