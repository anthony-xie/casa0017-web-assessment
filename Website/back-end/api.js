//Function to call the Postcode.io API to get the latitude and longitude of the postcodes
export async function getGeoCode(postcodes) {

    const response = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({postcodes: postcodes}),
        redirect: "follow"
    });

    if (!response.ok) {
        throw new Error(`Failed to get geocode for postcodes: ${response.statusText}`, response.status);
    }

    const geoCodes = await response.json();

    //Check if any of the postcodes could not be identified
    if (geoCodes.result.some(item => item === null || item.result === null)) {
        throw new Error("One or more postcodes could not be identified");
    }

    //Check if any of the postcodes are outside of London
    if (geoCodes.result.some(item => item.result.region !== "London")) {
        throw new Error("One or more postcodes are outside of London");
    }

    return geoCodes.result.map(item => ({
        postcode: item.query,
        latitude: item.result.latitude,
        longitude: item.result.longitude
    }));
}

//Function to call the TFL Journey Planner API
async function getJourneyPlan(from, to) {
    const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${from}/to/${to}`;

}