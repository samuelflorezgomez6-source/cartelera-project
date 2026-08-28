import { 
    getRooms, 
    getNowPlayingMovies, 
    getFunctionsByMovie, 
    getRoomById,
    getSeatsByRoom,
    getFunctionSeats,
    saveRating,
    getRatingsByMovie // Importamos la nueva función
} from "./api.js";

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
let allMovies = [];
let selectedSeats = []; 
let currentFunction = null;
let currentMovieId = null;

function getSeatLocation(seatCode, seatsPerRow = 8) {
    const rowLetter = seatCode.charAt(0);
    const seatNum = parseInt(seatCode.slice(1));
    
    let verticalLoc = "Centro";
    if (rowLetter <= 'B') verticalLoc = "Frontal";
    else if (rowLetter >= 'E') verticalLoc = "Posterior";

    let horizontalLoc = "Centro";
    if (seatNum <= Math.floor(seatsPerRow / 3)) horizontalLoc = "Izquierda";
    else if (seatNum > Math.floor((seatsPerRow / 3) * 2)) horizontalLoc = "Derecha";

    return `${verticalLoc} ${horizontalLoc}`.trim();
}

async function loadRooms() {
    const rooms = await getRooms();
    const roomsContainer = document.getElementById("rooms-container");

    if (!roomsContainer) return;

    roomsContainer.innerHTML = rooms.map(room => `
        <div class="room-card" style="border: 1px solid #ccc; padding: 15px; border-radius: 8px; width: 200px;">
            <h3>${room.name}</h3>
            <p>Filas: ${room.rows}</p>
            <p>Asientos por fila: ${room.seatsPerRow}</p>
            <p>Capacidad: ${room.capacity}</p>
        </div>
    `).join("");
}

function renderMovies(moviesList) {
    const moviesContainer = document.getElementById("movies-container");
    if (!moviesContainer) return;

    moviesContainer.innerHTML = "";

    if (moviesList.length === 0) {
        moviesContainer.innerHTML = "<p>No se encontraron películas con ese título.</p>";
        return;
    }

    moviesList.forEach(movie => {
        const posterUrl = movie.poster_path 
            ? `${IMAGE_BASE_URL}${movie.poster_path}` 
            : 'https://via.placeholder.com/500x750?text=Sin+Imagen';

        const movieCard = document.createElement("div");
        movieCard.classList.add("movie-card");

        movieCard.innerHTML = `
            <img src="${posterUrl}" alt="${movie.title}">
            <h3>${movie.title}</h3>
            <p>⭐ ${movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}</p>
            <button type="button" class="view-details-btn" data-movie-id="${movie.id}">Ver Funciones</button>
        `;

        moviesContainer.appendChild(movieCard);
    });

    document.querySelectorAll(".view-details-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const movieId = parseInt(e.currentTarget.getAttribute("data-movie-id"));
            showMovieDetails(movieId);
        });
    });
}

// Cargar y mostrar lista de valoraciones
async function loadAndRenderRatings(movieId) {
    const ratingModule = document.getElementById("rating-module");
    if (!ratingModule) return;

    const ratings = await getRatingsByMovie(movieId);
    
    // Si ya existe la lista de comentarios previa, la removemos para actualizarla
    const existingList = document.getElementById("ratings-list-container");
    if (existingList) existingList.remove();

    const ratingsListContainer = document.createElement("div");
    ratingsListContainer.id = "ratings-list-container";
    ratingsListContainer.style.marginTop = "20px";

    if (ratings.length === 0) {
        ratingsListContainer.innerHTML = "<h4>Opiniones de los usuarios</h4><p><i>Aún no hay comentarios para esta película. ¡Sé el primero en opinar!</i></p>";
    } else {
        const listHTML = ratings.map(r => `
            <div style="background: #fff; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid #e0e0e0;">
                <div>${"⭐".repeat(r.score)} <small style="color: #666;">(${new Date(r.date).toLocaleDateString()})</small></div>
                <p style="margin: 5px 0 0 0;">${r.comment ? r.comment : "<em>Sin comentario escrito.</em>"}</p>
            </div>
        `).join("");

        ratingsListContainer.innerHTML = `<h4>Opiniones de los usuarios (${ratings.length})</h4>${listHTML}`;
    }

    ratingModule.appendChild(ratingsListContainer);
}

async function showMovieDetails(movieId) {
    currentMovieId = movieId;
    const movie = allMovies.find(m => m.id === movieId);
    const functions = await getFunctionsByMovie(movieId);

    const posterUrl = movie.poster_path 
        ? `${IMAGE_BASE_URL}${movie.poster_path}` 
        : 'https://via.placeholder.com/500x750?text=Sin+Imagen';

    const detailContainer = document.getElementById("movie-detail-content");
    
    const functionsHTML = await Promise.all(functions.map(async (fn) => {
        const room = await getRoomById(fn.roomId);
        return `
            <div class="function-card">
                <p><strong>📅 Fecha:</strong> ${fn.date}</p>
                <p><strong>⏰ Hora:</strong> ${fn.time}</p>
                <p><strong>🏛️ ${room ? room.name : 'Sala'}</strong></p>
                <p><strong>💵 Precio:</strong> $${fn.price.toLocaleString()}</p>
                <button type="button" class="select-function-btn" data-function-id="${fn.id}" data-room-id="${fn.roomId}">Seleccionar Función</button>
            </div>
        `;
    }));

    detailContainer.innerHTML = `
        <img class="movie-detail-poster" src="${posterUrl}" alt="${movie.title}">
        <div class="movie-detail-info">
            <h2>${movie.title}</h2>
            <p><strong>Sinopsis:</strong> ${movie.overview || 'Sin descripción disponible.'}</p>
            <p><strong>Fecha de estreno:</strong> ${movie.release_date}</p>
            <p><strong>Valoración TMDB:</strong> ⭐ ${movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'} / 10</p>
            
            <h3>Funciones disponibles</h3>
            <div class="functions-list">
                ${functionsHTML.length > 0 ? functionsHTML.join('') : '<p>No hay funciones programadas para esta película.</p>'}
            </div>
        </div>
    `;

    document.getElementById("cartelera-section").style.display = "none";
    document.getElementById("salas-section").style.display = "none";
    document.getElementById("receipt-section").style.display = "none";
    document.getElementById("movie-detail-section").style.display = "block";

    // Cargar los comentarios guardados en db.json
    await loadAndRenderRatings(movieId);

    document.querySelectorAll(".select-function-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const functionId = parseInt(e.currentTarget.getAttribute("data-function-id"));
            const roomId = e.currentTarget.getAttribute("data-room-id");
            showSeatsMap(functionId, roomId);
        });
    });
}

async function showSeatsMap(functionId, roomId) {
    currentFunction = functionId;
    selectedSeats = [];
    updateSelectedSeatsUI();

    const room = await getRoomById(String(roomId));
    const functionSeats = await getFunctionSeats(functionId);
    const seatsContainer = document.getElementById("seats-container");

    seatsContainer.innerHTML = "";

    if (!room) {
        seatsContainer.innerHTML = "<p>Error al cargar la sala.</p>";
        return;
    }

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for (let r = 0; r < room.rows; r++) {
        const rowLetter = alphabet[r];
        const rowDiv = document.createElement("div");
        rowDiv.classList.add("seat-row");

        for (let s = 1; s <= room.seatsPerRow; s++) {
            const seatCode = `${rowLetter}${s}`;
            
            const fSeat = functionSeats.find(fs => fs.seatCode === seatCode || fs.seatId === seatCode);
            const status = fSeat ? fSeat.status : "available";

            const seatBtn = document.createElement("button");
            seatBtn.type = "button";
            seatBtn.classList.add("seat-btn", status);
            seatBtn.innerText = seatCode;
            seatBtn.dataset.seatCode = seatCode;

            if (status !== "available") {
                seatBtn.disabled = true;
            } else {
                seatBtn.addEventListener("click", (e) => {
                    e.preventDefault();
                    toggleSeatSelection(seatBtn, seatCode);
                });
            }

            rowDiv.appendChild(seatBtn);
        }

        seatsContainer.appendChild(rowDiv);
    }

    document.getElementById("movie-detail-section").style.display = "none";
    document.getElementById("receipt-section").style.display = "none";
    document.getElementById("seats-map-section").style.display = "block";
}

function toggleSeatSelection(seatBtn, seatCode) {
    if (selectedSeats.includes(seatCode)) {
        selectedSeats = selectedSeats.filter(code => code !== seatCode);
        seatBtn.classList.remove("selected");
        seatBtn.classList.add("available");
    } else {
        selectedSeats.push(seatCode);
        seatBtn.classList.remove("available");
        seatBtn.classList.add("selected");
    }
    updateSelectedSeatsUI();
}

function updateSelectedSeatsUI() {
    const textSpan = document.getElementById("selected-seats-text");
    const confirmBtn = document.getElementById("confirm-booking-btn");

    if (selectedSeats.length === 0) {
        textSpan.innerText = "Ninguna";
        confirmBtn.disabled = true;
    } else {
        const seatsWithLoc = selectedSeats.map(code => `${code} (${getSeatLocation(code)})`);
        textSpan.innerText = seatsWithLoc.join(", ");
        confirmBtn.disabled = false;
    }
}

document.getElementById("back-to-movies-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("movie-detail-section").style.display = "none";
    document.getElementById("receipt-section").style.display = "none";
    document.getElementById("cartelera-section").style.display = "block";
    document.getElementById("salas-section").style.display = "block";
});

document.getElementById("back-to-detail-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("seats-map-section").style.display = "none";
    document.getElementById("receipt-section").style.display = "none";
    document.getElementById("movie-detail-section").style.display = "block";
});

async function loadMovies() {
    allMovies = await getNowPlayingMovies();
    renderMovies(allMovies);

    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const filteredMovies = allMovies.filter(movie => 
                movie.title.toLowerCase().includes(searchTerm)
            );
            renderMovies(filteredMovies);
        });
    }
}

loadRooms();
loadMovies();

document.getElementById("confirm-booking-btn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const userName = document.getElementById("user-name")?.value.trim();
    const userEmail = document.getElementById("user-email")?.value.trim();

    if (!userName || !userEmail) {
        alert("Por favor ingresa tu nombre y correo electrónico para continuar.");
        return;
    }

    if (selectedSeats.length === 0 || !currentFunction) return;

    try {
        const promises = selectedSeats.map(seatCode => {
            return fetch("http://localhost:3000/functionSeats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    functionId: String(currentFunction),
                    seatCode: seatCode,
                    status: "sold"
                })
            });
        });

        await Promise.all(promises);

        const resFn = await fetch(`http://localhost:3000/functions/${currentFunction}`);
        let fnData = resFn.ok ? await resFn.json() : {};
        let roomData = fnData.roomId ? await getRoomById(String(fnData.roomId)) : null;
        const movie = allMovies.find(m => String(m.id) === String(fnData.tmdbId));

        const priceNum = fnData.price || 0;
        const totalPrice = priceNum * selectedSeats.length;

        const seatsDetailed = selectedSeats.map(code => ({
            seatCode: code,
            location: getSeatLocation(code)
        }));

        await fetch("http://localhost:3000/reservations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userName: userName,
                email: userEmail,
                functionId: String(currentFunction),
                tmdbId: fnData.tmdbId,
                quantity: selectedSeats.length,
                seats: seatsDetailed,
                total: totalPrice,
                date: new Date().toISOString(),
                status: "confirmed"
            })
        });

        const receiptContent = document.getElementById("receipt-content");
        if (receiptContent) {
            receiptContent.innerHTML = `
                <p><strong>Cliente:</strong> ${userName} (${userEmail})</p>
                <p><strong>Película:</strong> ${movie ? movie.title : 'Cine Colombia'}</p>
                <p><strong>Sala:</strong> ${roomData ? roomData.name : 'Sala'}</p>
                <p><strong>Fecha:</strong> ${fnData.date || 'N/A'}</p>
                <p><strong>Hora:</strong> ${fnData.time || 'N/A'}</p>
                <p><strong>Sillas:</strong> ${selectedSeats.map(c => `${c} [${getSeatLocation(c)}]`).join(", ")}</p>
                <p><strong>Boletas:</strong> ${selectedSeats.length}</p>
                <p><strong>Precio unitario:</strong> $${priceNum.toLocaleString()}</p>
                <hr>
                <p style="font-size: 1.2em; color: #d9534f;"><strong>Total Pagado:</strong> $${totalPrice.toLocaleString()}</p>
            `;
        }

        document.getElementById("cartelera-section").style.display = "none";
        document.getElementById("salas-section").style.display = "none";
        document.getElementById("movie-detail-section").style.display = "none";
        document.getElementById("seats-map-section").style.display = "none";
        document.getElementById("receipt-section").style.display = "block";

    } catch (error) {
        console.error("Error al procesar la compra:", error);
    }
});

document.getElementById("finish-booking-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    selectedSeats = [];
    
    const nameInput = document.getElementById("user-name");
    const emailInput = document.getElementById("user-email");
    if (nameInput) nameInput.value = "";
    if (emailInput) emailInput.value = "";

    updateSelectedSeatsUI();
    
    document.getElementById("receipt-section").style.display = "none";
    document.getElementById("movie-detail-section").style.display = "none";
    document.getElementById("seats-map-section").style.display = "none";

    document.getElementById("cartelera-section").style.display = "block";
    document.getElementById("salas-section").style.display = "block";
});

// Guardar valoración y refrescar la lista de comentarios automáticamente
document.getElementById("rating-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentMovieId) return;

    const score = parseInt(document.getElementById("rating-stars").value);
    const comment = document.getElementById("rating-comment").value.trim();

    const ratingPayload = {
        tmdbId: currentMovieId,
        score: score,
        comment: comment,
        date: new Date().toISOString()
    };

    await saveRating(ratingPayload);

    alert("¡Muchas gracias! Tu valoración ha sido guardada correctamente.");
    document.getElementById("rating-comment").value = "";

    // Refresca la lista de comentarios en pantalla sin recargar la página
    await loadAndRenderRatings(currentMovieId);
});