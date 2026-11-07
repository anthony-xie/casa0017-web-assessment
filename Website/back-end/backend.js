import { getGeoCode } from './api.js';
import { db } from './db.js';

//Function to parse the input from the user
export async function parseInput(input){
    //Ensure that the input is a JSON object
    if (typeof input !== 'object' || input === null) {
        //Throws Error 400 if the input is not a JSON object
        throw new Error('Input must be a JSON object', 400);
    }

    const {postcodes, category} = input;

    //Ensure that each postcode is a string and not empty
    if (!Array.isArray(postcodes) || postcodes.some(postcode => typeof postcode !== 'string' || postcode.trim() === '')) {
        //Throws Error 400 if one or more of the postcodes are illegal
        throw new Error('Postcodes must be an array of non-empty strings', 400);
    }
    
    //Call api postcode.io API to get the latitude and longitude of the postcodes
    const coords = await getGeoCode(postcodes);
    return {coords, category};
}

//Function to find the geometric midpoint of everyone's postcodes
function findMidPoint(coords){
    return {
        latitude: coords.reduce((sum, coord) => sum + coord.latitude,0) / coords.length,
        longitude: coords.reduce((sum, coord) => sum + coord.longitude,0) / coords.length
    };
}

//Function to find POIs nearest to the midpoint
function findNearestPlaces(midpoint, category){
    
}