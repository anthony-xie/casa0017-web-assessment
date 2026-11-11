import { getGeoCode } from './api.js';
import { db } from './db.js';
import { getJourneyPlan } from './api.js';
import { AppError } from './error.js';



//Function to parse the input from the user
export async function parseInput(input){
    //Ensure that the input is a JSON object
    if (typeof input !== 'object' || input === null) {
        //Throws Error 400 if the input is not a JSON object
        throw new AppError('Input must be a JSON object', 400);
    }

    const {postcodes, category} = input;

    //Ensure that category is valid
    const CATEGORIES = ['park', 'library', 'restaurant', 'cafe', 'pub'];
    if (!CATEGORIES.includes(category)){
        throw new AppError('Invalid category', 400);
    }

    //Ensure that each postcode is a string and not empty
    if (!Array.isArray(postcodes) || postcodes.some(postcode => typeof postcode !== 'string' || postcode.trim() === '')) {
        //Throws Error 400 if one or more of the postcodes are illegal
        throw new AppError('Postcodes must be an array of non-empty strings', 400);
    }

    //Ensure that the number of people is between 2 and 6
    if(postcodes.length < 2 || postcodes.length > 6){
        throw new AppError('Keep the number of people between 2 and 6', 400);
    }

    //Call postcode.io API to get the latitude and longitude of the postcodes
    const coords = await getGeoCode(postcodes);
    return { coords, category };
}

//Function to find the geometric midpoint of everyone's postcodes
function findMidPoint(coords){
    return {
        latitude: coords.reduce((sum, coord) => sum + coord.latitude,0) / coords.length,
        longitude: coords.reduce((sum, coord) => sum + coord.longitude,0) / coords.length
    };
}

//Function to find POIs nearest to the midpoint
async function findNearestPlaces(midpoint, category){
    //Conversion factors for degrees to kilometers, around equal to 3km
    const latDelta = 3 / 111.32;
    const lonDelta = 3 / (111.32 * Math.cos(midpoint.latitude * Math.PI / 180));

    const [pois] = await db.execute(
        //Selects the 3 POIs closest to the midpoint around a 6kmx6km box
        `SELECT osm_id, name, category, lat, lon, opening_hours, cuisine, postcode 
            FROM osm_venues
            WHERE category = ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
            ORDER BY (POW(lat - ?, 2) + POW((lon - ?) * COS(RADIANS(?)), 2)) ASC
            LIMIT 3`,
            [category, 
            midpoint.latitude - latDelta, 
            midpoint.latitude + latDelta, 
            midpoint.longitude - lonDelta,
            midpoint.longitude + lonDelta,  
            midpoint.latitude, 
            midpoint.longitude,
            midpoint.latitude]
    );

    //Throws error if no POIs were found in range
    if (pois.length === 0) {
        throw new AppError(`No POIs found within 3km of the midpoint`, 404);
    };
    
    return pois;
}

//Function that returns the POIs near the midpoint
export async function findMeetingPlaces(input){
    const { coords, category } = await parseInput(input);
    const midpoint = findMidPoint(coords);
    const pois = await findNearestPlaces(midpoint, category);
    return { coords, pois, midpoint };
}

//Function that returns the routes to the frontend
export async function routes(coords, poi){
    const journeys = await Promise.all(
        coords.map(c => getJourneyPlan(`${c.latitude},${c.longitude}`, `${poi.lat},${poi.lon}`))
    );

    //Returns null if someone couldn't reach the POI
    if (journeys.some(j => j === null)){
        return null;
    }

    return journeys;
}

export async function search(input){
    const { coords, pois, midpoint } = await findMeetingPlaces(input);

    //Routes for all POIs
    const allJourneys = await Promise.all(pois.map(poi => routes(coords, poi)));

    const places = []

    pois.forEach((poi, i) =>{
        //Ignore POI if one of the people can't reach it
        if (allJourneys[i] === null){
            return;
        }

        places.push({
            name: poi.name,
            postcode: poi.postcode,
            lat: poi.lat,
            lon: poi.lon,
            opening_hours: poi.opening_hours,
            routes: formatRoutes(allJourneys[i])
        });
    });

    if (places.length === 0){
        throw new AppError('No POIs found that everyone can reach', 404);
    }

    return { coords, places, midpoint };
}

//Only return the fastest journey for each person
function formatRoutes(plans) {
    return plans.map(plan => {
        //Choosest the fastest journey
        const best = plan.journeys.reduce((a, b) => (b.duration < a.duration ? b : a));
        return {
            minutes: best.duration,
            leave: best.startDateTime,
            arrive: best.arrivalDateTime,
            //only sends required information for each leg into the frontend
            legs: best.legs.map(leg => ({
                mode: leg.mode?.name,
                summary: leg.instruction?.summary,
                minutes: leg.duration,
                pathLine: leg.path?.lineString ? JSON.parse(leg.path.lineString) : []
                
            }))
        };
    });
}