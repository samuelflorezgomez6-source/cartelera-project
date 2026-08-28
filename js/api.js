import { TMDB_TOKEN } from "./config.js";

const LOCAL_API_URL = "http://localhost:3000";
const TMDB_API_URL = "https://api.themoviedb.org/3";

export async function getRooms() {
    const response = await fetch(`${LOCAL_API_URL}/rooms`);
    return await response.json();
}

export async function getNowPlayingMovies() {
    const response = await fetch(
        `${TMDB_API_URL}/movie/now_playing?language=es-ES`,
        {
            headers: {
                Authorization: `Bearer ${TMDB_TOKEN}`
            }
        }
    );
    const data = await response.json();
    return data.results;
}

export async function getFunctionsByMovie(tmdbId) {
    const response = await fetch(`${LOCAL_API_URL}/functions?tmdbId=${tmdbId}`);
    return await response.json();
}

export async function getRoomById(roomId) {
    const response = await fetch(`${LOCAL_API_URL}/rooms/${roomId}`);
    return await response.json();
}

export async function getSeatsByRoom(roomId) {
    const response = await fetch(`${LOCAL_API_URL}/seats?roomId=${roomId}`);
    return await response.json();
}

export async function getFunctionSeats(functionId) {
    const response = await fetch(`${LOCAL_API_URL}/functionSeats?functionId=${functionId}`);
    return await response.json();
}

export async function saveRating(ratingData) {
    try {
        const response = await fetch(`${LOCAL_API_URL}/ratings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(ratingData)
        });
        return await response.json();
    } catch (error) {
        console.error("Error al guardar la calificación:", error);
    }
}

// NUEVA FUNCIÓN: Obtener valoraciones de una película específica
export async function getRatingsByMovie(tmdbId) {
    try {
        const response = await fetch(`${LOCAL_API_URL}/ratings?tmdbId=${tmdbId}`);
        return await response.json();
    } catch (error) {
        console.error("Error al obtener calificaciones:", error);
        return [];
    }
}