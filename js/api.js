import { TMDB_TOKEN } from "./config.js";

const LOCAL_API_URL = "http://localhost:3000";
const TMDB_API_URL = "https://api.themoviedb.org/3";

async function tmdbFetch(endpoint) {
    const response = await fetch(`${TMDB_API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${TMDB_TOKEN}` }
    });
    if (!response.ok) throw new Error(`TMDB error ${response.status}`);
    return response.json();
}

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
}

function normalizeIds(value) {
    if (Array.isArray(value)) return value.map(normalizeIds);
    if (value && typeof value === "object") {
        const out = { ...value };
        for (const key of Object.keys(out)) {
            if (key === "id" && typeof out[key] === "string" && out[key].trim() !== "" && !Number.isNaN(Number(out[key]))) {
                out[key] = Number(out[key]);
            } else {
                out[key] = normalizeIds(out[key]);
            }
        }
        return out;
    }
    return value;
}

async function localFetch(endpoint) {
    const response = await fetch(`${LOCAL_API_URL}${endpoint}`);
    if (!response.ok) throw new Error(`API error ${response.status} en ${endpoint}`);
    return normalizeIds(await response.json());
}

/* ------------------------- TMDB ------------------------- */

export async function getNowPlayingMovies() {
    const data = await tmdbFetch("/movie/now_playing?language=es-ES");
    return data.results;
}

export async function getPopularMovies() {
    const data = await tmdbFetch("/movie/popular?language=es-ES");
    return data.results;
}

export async function getMovieGenres() {
    const data = await tmdbFetch("/genre/movie/list?language=es-ES");
    return data.genres;
}

export async function getMovieDetails(movieId) {
    return tmdbFetch(`/movie/${movieId}?language=es-ES`);
}

export async function getMovieCredits(movieId) {
    return tmdbFetch(`/movie/${movieId}/credits?language=es-ES`);
}

export async function getMovieTrailers(movieId) {
    const data = await tmdbFetch(`/movie/${movieId}/videos?language=es-ES`);
    return data.results;
}

export async function getPersonDetails(personId) {
    return tmdbFetch(`/person/${personId}?language=es-ES`);
}

/* ----------------------- JSON Server ----------------------- */

export async function getRooms() {
    return localFetch("/rooms");
}

export async function getRoomById(roomId) {
    return localFetch(`/rooms/${roomId}`);
}

export async function getFunctions() {
    return localFetch("/functions");
}

export async function getFunctionsByMovie(tmdbId) {
    return localFetch(`/functions?tmdbId=${num(tmdbId)}`);
}

export async function getFunctionById(functionId) {
    return localFetch(`/functions/${num(functionId)}`);
}

export async function getSeatsByRoom(roomId) {
    return localFetch(`/seats?roomId=${num(roomId)}`);
}

export async function getFunctionSeats(functionId) {
    return localFetch(`/functionSeats?functionId=${num(functionId)}`);
}

export async function getAllFunctionSeats() {
    return localFetch("/functionSeats");
}

export async function getSeatAvailability(functionId, seat) {
    const byIdResponse = await fetch(`${LOCAL_API_URL}/functionSeats?functionId=${num(functionId)}&seatId=${num(seat.seatId)}`);
    const idList = normalizeIds(await byIdResponse.json());
    if (idList.length > 0) return idList[0];

    const byCodeResponse = await fetch(`${LOCAL_API_URL}/functionSeats?functionId=${num(functionId)}&seatCode=${seat.seatCode}`);
    const codeList = normalizeIds(await byCodeResponse.json());
    if (codeList.length > 0) return codeList[0];

    return null;
}

export async function updateFunctionSeatStatus(functionId, seat, status) {
    const existing = await getSeatAvailability(functionId, seat);

    if (existing && existing.id) {
        const response = await fetch(`${LOCAL_API_URL}/functionSeats/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
        });
        return normalizeIds(await response.json());
    }

    const response = await fetch(`${LOCAL_API_URL}/functionSeats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            functionId: num(functionId),
            seatId: num(seat.seatId),
            seatCode: seat.seatCode,
            status
        })
    });
    return normalizeIds(await response.json());
}

export async function saveReservation(reservationData) {
    const response = await fetch(`${LOCAL_API_URL}/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reservationData)
    });
    return normalizeIds(await response.json());
}

export async function savePurchase(purchaseData) {
    const response = await fetch(`${LOCAL_API_URL}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(purchaseData)
    });
    return normalizeIds(await response.json());
}

export async function saveRating(ratingData) {
    try {
        const response = await fetch(`${LOCAL_API_URL}/ratings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ratingData)
        });
        return normalizeIds(await response.json());
    } catch (error) {
        console.error("Error al guardar la calificación:", error);
    }
}

export async function getRatingsByMovie(tmdbId) {
    try {
        const response = await fetch(`${LOCAL_API_URL}/ratings?tmdbId=${num(tmdbId)}`);
        return normalizeIds(await response.json());
    } catch (error) {
        console.error("Error al obtener calificaciones:", error);
        return [];
    }
}

/* ----------------------- Promociones y usuarios ----------------------- */

export async function getPromoCodes() {
    try {
        const response = await fetch(`${LOCAL_API_URL}/promoCodes`);
        return normalizeIds(await response.json());
    } catch (error) {
        console.error("Error al obtener códigos promocionales:", error);
        return [];
    }
}

export async function getPromoByCode(code) {
    try {
        const response = await fetch(`${LOCAL_API_URL}/promoCodes?code=${encodeURIComponent(code)}`);
        const list = normalizeIds(await response.json());
        return list.length > 0 ? list[0] : null;
    } catch (error) {
        console.error("Error al consultar el código promocional:", error);
        return null;
    }
}

export async function getUserByEmail(email) {
    try {
        const response = await fetch(`${LOCAL_API_URL}/users?email=${encodeURIComponent(email)}`);
        const list = normalizeIds(await response.json());
        return list.length > 0 ? list[0] : null;
    } catch (error) {
        console.error("Error al consultar el usuario:", error);
        return null;
    }
}

export async function saveUser(userData) {
    const response = await fetch(`${LOCAL_API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
    });
    return normalizeIds(await response.json());
}