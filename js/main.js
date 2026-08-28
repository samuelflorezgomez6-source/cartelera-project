import {
    getRooms,
    getNowPlayingMovies,
    getPopularMovies,
    getMovieGenres,
    getMovieDetails,
    getMovieCredits,
    getMovieTrailers,
    getFunctionsByMovie,
    getFunctionById,
    getRoomById,
    getSeatsByRoom,
    getFunctionSeats,
    getSeatAvailability,
    updateFunctionSeatStatus,
    saveReservation,
    savePurchase,
    saveRating,
    getRatingsByMovie
} from "./api.js";

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

let allMovies = [];
let allGenres = [];
let selectedSeats = [];            // [{ seatId, seatCode, location }]
let currentMovieId = null;
let currentMovie = null;           // Objeto completo de TMDB
let currentFunction = null;        // Función seleccionada (JSON Server)
let currentRoom = null;            // Sala de la función
let currentOperation = "reserve";  // "reserve" | "purchase"
let confirmInProgress = false;     // Evita doble envío en confirmBooking
let activeCatalog = "cartelera";   // "cartelera" | "explorar" (consulta general)

/* ----------------------- Utilidades ----------------------- */

function formatMoney(value) {
    return "$" + (value || 0).toLocaleString("es-CO");
}

function formatDate(dateStr) {
    if (!dateStr) return "N/A";
    const parts = String(dateStr).split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("es-CO");
}

function fallbackSeatLocation(seatCode, seatsPerRow = 6) {
    const rowLetter = seatCode.charAt(0);
    const seatNum = parseInt(seatCode.slice(1));

    let verticalLoc = "Centro";
    if (rowLetter <= 'B') verticalLoc = "Frontal";
    else if (rowLetter === 'C') verticalLoc = "Media";
    else if (rowLetter >= 'D') verticalLoc = "Posterior";

    let horizontalLoc = "Centro";
    if (seatNum <= Math.floor(seatsPerRow / 3)) horizontalLoc = "Izquierda";
    else if (seatNum > Math.floor((seatsPerRow / 3) * 2)) horizontalLoc = "Derecha";

    const location = `${verticalLoc} ${horizontalLoc}`.trim();
    return location;
}

function getSeatLocation(seat) {
    if (seat && seat.location) return seat.location;
    const code = seat && seat.seatCode ? seat.seatCode : "";
    return fallbackSeatLocation(code, currentRoom ? currentRoom.seatsPerRow : 6);
}

/* ----------------------- Filtros de cartelera ----------------------- */

function getFilteredMovies() {
    const searchTerm = (document.getElementById("search-input")?.value || "").toLowerCase().trim();
    const genreId = document.getElementById("genre-filter")?.value || "";

    return allMovies.filter(movie => {
        const matchesTitle = movie.title.toLowerCase().includes(searchTerm);
        const matchesGenre = !genreId || (movie.genre_ids || []).includes(Number(genreId));
        return matchesTitle && matchesGenre;
    });
}

async function loadGenres() {
    try {
        allGenres = await getMovieGenres();
    } catch (e) {
        console.warn("No se pudieron cargar los géneros:", e);
        allGenres = [];
    }
    const select = document.getElementById("genre-filter");
    if (!select) return;

    select.innerHTML = `<option value="">Todos los géneros</option>` +
        allGenres.map(g => `<option value="${g.id}">${g.name}</option>`).join("");

    select.addEventListener("change", () => renderMovies(getFilteredMovies()));
}

/* ----------------------- Cartelera y salas ----------------------- */

async function loadRooms() {
    const rooms = await getRooms();
    const roomsContainer = document.getElementById("rooms-container");
    if (!roomsContainer) return;

    roomsContainer.innerHTML = rooms.map(room => `
        <div class="room-card">
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
            <img src="${posterUrl}" alt="Póster de ${movie.title}">
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

/* ----------------------- Valoraciones ----------------------- */

async function loadAndRenderRatings(movieId) {
    const ratingModule = document.getElementById("rating-module");
    if (!ratingModule) return;

    const ratings = await getRatingsByMovie(movieId);

    const existingList = document.getElementById("ratings-list-container");
    if (existingList) existingList.remove();

    const ratingsListContainer = document.createElement("div");
    ratingsListContainer.id = "ratings-list-container";
    ratingsListContainer.style.marginTop = "20px";

    if (ratings.length === 0) {
        ratingsListContainer.innerHTML = "<h4>Opiniones de los usuarios</h4><p><i>Aún no hay comentarios para esta película. ¡Sé el primero en opinar!</i></p>";
    } else {
        const listHTML = ratings.map(r => `
            <div class="rating-card">
                <div>${"⭐".repeat(r.score)} <small>(${formatDate(r.date)})</small></div>
                <p style="margin: 5px 0 0 0;">${r.comment ? r.comment : "<em>Sin comentario escrito.</em>"}</p>
            </div>
        `).join("");

        ratingsListContainer.innerHTML = `<h4>Opiniones de los usuarios (${ratings.length})</h4>${listHTML}`;
    }

    ratingModule.appendChild(ratingsListContainer);
}

/* ----------------------- Detalle de película ----------------------- */

async function showMovieDetails(movieId) {
    currentMovieId = movieId;

    const [details, credits, videos, functions] = await Promise.all([
        getMovieDetails(movieId).catch(() => null),
        getMovieCredits(movieId).catch(() => null),
        getMovieTrailers(movieId).catch(() => null),
        getFunctionsByMovie(movieId).catch(() => [])
    ]);

    currentMovie = details || allMovies.find(m => m.id === movieId) || null;
    if (!currentMovie) {
        alert("No se pudo obtener la información de la película.");
        return;
    }

    const posterUrl = currentMovie.poster_path
        ? `${IMAGE_BASE_URL}${currentMovie.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin+Imagen';

    const genres = (details && details.genres ? details.genres.map(g => g.name) : []).join(", ") || "—";
    const runtime = details && details.runtime ? `${details.runtime} min` : "—";
    const director = (credits && credits.crew.find(p => p.job === "Director"))?.name || "—";
    const cast = (credits && credits.cast.slice(0, 6)) || [];
    const castHTML = cast.length > 0
        ? cast.map(p => `<li>${p.name} <small>(${p.character || "—"})</small></li>`).join("")
        : "<li>Sin información.</li>";

    const trailer = videos && videos.find(v => v.site === "YouTube" && v.type === "Trailer")
        || (videos && videos.find(v => v.site === "YouTube"));
    const trailerHTML = trailer
        ? `<button type="button" id="trailer-open-btn" class="secondary-btn" data-youtube-key="${trailer.key}">▶ Ver Trailer</button>`
        : "<p><i>No hay trailer disponible.</i></p>";

    const detailContainer = document.getElementById("movie-detail-content");

    const functionsHTML = await Promise.all(functions.map(async (fn) => {
        const room = await getRoomById(fn.roomId).catch(() => null);
        const capacity = room ? room.capacity : 0;
        const fnSeats = await getFunctionSeats(fn.id).catch(() => []);
        const occupied = fnSeats.filter(fs => fs.status && fs.status !== "available").length;
        const available = Math.max(0, capacity - occupied);

        return `
            <div class="function-card">
                <p><strong>📅 Fecha:</strong> ${formatDate(fn.date)}</p>
                <p><strong>⏰ Hora:</strong> ${fn.time}</p>
                <p><strong>🏛️ ${room ? room.name : 'Sala'}</strong></p>
                <p><strong>💵 Precio:</strong> ${formatMoney(fn.price)}</p>
                <p class="available-count">🪑 <strong>${available}</strong> asientos disponibles</p>
                <button type="button" class="select-function-btn" data-function-id="${fn.id}" data-room-id="${fn.roomId}">Seleccionar Función</button>
            </div>
        `;
    }));

    detailContainer.innerHTML = `
        <img class="movie-detail-poster" src="${posterUrl}" alt="Póster de ${currentMovie.title}">
        <div class="movie-detail-info">
            <h2>${currentMovie.title}</h2>
            <p><strong>Sinopsis:</strong> ${currentMovie.overview || 'Sin descripción disponible.'}</p>
            <p><strong>Género:</strong> ${genres}</p>
            <p><strong>Duración:</strong> ${runtime}</p>
            <p><strong>Fecha de estreno:</strong> ${currentMovie.release_date || '—'}</p>
            <p><strong>Director:</strong> ${director}</p>
            <p><strong>Valoración TMDB:</strong> ⭐ ${currentMovie.vote_average ? currentMovie.vote_average.toFixed(1) : 'N/A'} / 10</p>
            <div class="cast-block">
                <p><strong>Reparto / Protagonistas:</strong></p>
                <ul>${castHTML}</ul>
            </div>
            <div class="trailer-block">
                <p><strong>Trailer:</strong></p>
                ${trailerHTML}
            </div>

            <h3>Funciones disponibles</h3>
            <div class="functions-list">
                ${functionsHTML.length > 0 ? functionsHTML.join('') : '<p>No hay funciones programadas para esta película.</p>'}
            </div>
        </div>
    `;

    showSection("movie-detail-section");

    await loadAndRenderRatings(movieId);

    const trailerOpenBtn = document.getElementById("trailer-open-btn");
    if (trailerOpenBtn) {
        trailerOpenBtn.addEventListener("click", () => openTrailerModal(trailerOpenBtn.dataset.youtubeKey));
    }

    document.querySelectorAll(".select-function-btn[data-function-id]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const functionId = e.currentTarget.getAttribute("data-function-id");
            const roomId = e.currentTarget.getAttribute("data-room-id");
            showSeatsMap(functionId, roomId);
        });
    });
}

function openTrailerModal(youtubeKey) {
    const modal = document.getElementById("trailer-modal");
    const frame = document.getElementById("trailer-frame");
    if (!modal) return;
    if (frame && youtubeKey) frame.src = `https://www.youtube.com/embed/${youtubeKey}`;
    modal.style.display = "flex";
}

function closeTrailerModal() {
    const modal = document.getElementById("trailer-modal");
    const frame = document.getElementById("trailer-frame");
    if (!modal) return;
    modal.style.display = "none";
    if (frame) frame.src = "";
}

/* ----------------------- Mapa de asientos ----------------------- */

async function showSeatsMap(functionId, roomId) {
    functionId = Number(functionId);
    roomId = Number(roomId);

    selectedSeats = [];
    currentOperation = "reserve";
    const opSelect = document.getElementById("operation-type");
    if (opSelect) opSelect.value = "reserve";

    try {
        currentFunction = await getFunctionById(functionId);
    } catch (e) {
        alert("No se pudo cargar la función seleccionada.");
        return;
    }

    currentRoom = await getRoomById(roomId).catch(() => null);
    const seats = await getSeatsByRoom(roomId).catch(() => []);
    const functionSeats = await getFunctionSeats(functionId).catch(() => []);

    const seatsContainer = document.getElementById("seats-container");
    seatsContainer.innerHTML = "";

    if (!currentRoom) {
        seatsContainer.innerHTML = "<p>Error al cargar la sala.</p>";
        return;
    }

    const statusMap = {};
    functionSeats.forEach(fs => {
        if (fs.seatId !== undefined) statusMap[fs.seatId] = fs.status;
        if (fs.seatCode) statusMap[fs.seatCode] = fs.status;
    });

    const rowGroups = {};
    seats.forEach(seat => {
        if (!rowGroups[seat.row]) rowGroups[seat.row] = [];
        rowGroups[seat.row].push(seat);
    });

    Object.keys(rowGroups).sort().forEach(rowLetter => {
        const rowDiv = document.createElement("div");
        rowDiv.classList.add("seat-row");
        rowDiv.setAttribute("aria-label", `Fila ${rowLetter}`);

        rowGroups[rowLetter].sort((a, b) => a.number - b.number).forEach(seat => {
            const status = statusMap[seat.id] || statusMap[seat.seatCode] || "available";

            const seatBtn = document.createElement("button");
            seatBtn.type = "button";
            seatBtn.classList.add("seat-btn", status);
            seatBtn.innerText = seat.seatCode;
            seatBtn.dataset.seatId = seat.id;
            seatBtn.dataset.seatCode = seat.seatCode;
            seatBtn.dataset.location = seat.location || fallbackSeatLocation(seat.seatCode);
            seatBtn.title = `Asiento ${seat.seatCode} — ${statusMap[seat.id] ? statusLabel(status) : "Disponible"} (${seatBtn.dataset.location})`;
            seatBtn.setAttribute("aria-label", `Asiento ${seat.seatCode}, ${status}, ${seatBtn.dataset.location}`);

            if (status !== "available") {
                seatBtn.disabled = true;
                seatBtn.setAttribute("aria-disabled", "true");
            } else {
                seatBtn.addEventListener("click", (e) => {
                    e.preventDefault();
                    toggleSeatSelection(seatBtn, seat);
                });
            }

            rowDiv.appendChild(seatBtn);
        });

        seatsContainer.appendChild(rowDiv);
    });

    const occupiedCount = functionSeats.filter(fs => fs.status && fs.status !== "available").length;
    const availableCount = Math.max(0, (currentRoom.capacity || 0) - occupiedCount);

    const summaryLine = document.getElementById("function-summary-line");
    if (summaryLine) {
        summaryLine.innerHTML = `
            <strong>${currentRoom.name}</strong> ·
            ${formatDate(currentFunction.date)} ·
            ${currentFunction.time} h ·
            Precio ${formatMoney(currentFunction.price)} ·
            <span class="available-count">${availableCount} asientos disponibles</span>
        `;
    }

    updateSelectedSeatsUI();
    showSection("seats-map-section");
}

function statusLabel(status) {
    const labels = { available: "Disponible", selected: "Seleccionado", reserved: "Reservado", sold: "Ocupado" };
    return labels[status] || status;
}

function toggleSeatSelection(seatBtn, seat) {
    const isSelected = selectedSeats.some(s => s.seatId === seat.id);
    if (isSelected) {
        selectedSeats = selectedSeats.filter(s => s.seatId !== seat.id);
        seatBtn.classList.remove("selected");
        seatBtn.classList.add("available");
        seatBtn.title = `Asiento ${seat.seatCode} — Disponible (${seatBtn.dataset.location})`;
    } else {
        selectedSeats.push({
            seatId: seat.id,
            seatCode: seat.seatCode,
            location: seat.location || fallbackSeatLocation(seat.seatCode)
        });
        seatBtn.classList.remove("available");
        seatBtn.classList.add("selected");
        seatBtn.title = `Asiento ${seat.seatCode} — Seleccionado (${seatBtn.dataset.location})`;
    }
    updateSelectedSeatsUI();
}

function updateSelectedSeatsUI() {
    const textSpan = document.getElementById("selected-seats-text");
    const detailSpan = document.getElementById("selected-seats-detail");
    const ticketsSpan = document.getElementById("total-tickets-display");
    const totalSpan = document.getElementById("total-price-display");
    const warningP = document.getElementById("reserve-warning");
    const continueBtn = document.getElementById("continue-booking-btn");

    if (selectedSeats.length === 0) {
        if (textSpan) textSpan.innerText = "Ninguna";
        if (detailSpan) detailSpan.innerHTML = "";
        if (ticketsSpan) ticketsSpan.innerText = "0";
        if (totalSpan) totalSpan.innerText = "$0";
        if (continueBtn) continueBtn.disabled = true;
    } else {
        if (textSpan) textSpan.innerText = selectedSeats.map(s => s.seatCode).join(", ");

        if (detailSpan) {
            detailSpan.innerHTML = selectedSeats.map(s => `
                <span class="seat-chip">${s.seatCode} — Fila ${s.seatCode.charAt(0)}, Número ${s.seatCode.slice(1)}, Ubicación: ${s.location}</span>
            `).join(" ");
        }

        const priceNum = (currentFunction && currentFunction.price) || 0;
        const totalPrice = priceNum * selectedSeats.length;

        if (ticketsSpan) ticketsSpan.innerText = String(selectedSeats.length);
        if (totalSpan) totalSpan.innerText = formatMoney(totalPrice);
        if (warningP) warningP.innerHTML = `La cantidad de tickets (${selectedSeats.length}) debe coincidir con el número de sillas seleccionadas.`;
        if (continueBtn) continueBtn.disabled = false;
    }
}

/* ----------------------- Validación de disponibilidad ----------------------- */

async function checkSeatsStillAvailable() {
    const taken = [];
    for (const seat of selectedSeats) {
        const rec = await getSeatAvailability(currentFunction.id, seat);
        if (rec && rec.status && rec.status !== "available") {
            taken.push(seat.seatCode);
        }
    }
    return taken;
}

async function revalidateSelection() {
    const taken = await checkSeatsStillAvailable();
    if (taken.length === 0) return true;

    selectedSeats = selectedSeats.filter(s => !taken.includes(s.seatCode));
    alert(`Lo sentimos, ${taken.join(", ")} ya no está${taken.length > 1 ? "n" : ""} disponible${taken.length > 1 ? "s" : ""} (reservada o vendida). Se actualizó el mapa de asientos.`);
    showSeatsMap(currentFunction.id, currentRoom.id);
    hideModal();
    return false;
}

/* ----------------------- Resumen y confirmación ----------------------- */

function buildSummaryHTML() {
    const isReserve = currentOperation === "reserve";
    const priceNum = (currentFunction && currentFunction.price) || 0;
    const totalPrice = priceNum * selectedSeats.length;

    const seatsLines = selectedSeats
        .map(s => `${s.seatCode} - ${s.location}`)
        .join("\n");

    return `
--------------------------------
${isReserve ? "RESUMEN DE LA RESERVA" : "RESUMEN DE LA COMPRA"}
--------------------------------

Película: ${currentMovie ? currentMovie.title : "—"}
Sala: ${currentRoom ? currentRoom.name : "—"}
Fecha: ${formatDate(currentFunction.date)}
Hora: ${currentFunction.time}

Sillas seleccionadas:
${seatsLines}

Cantidad de tickets: ${selectedSeats.length}

Precio por ticket: ${formatMoney(priceNum)}
Total: ${formatMoney(totalPrice)}
`;
}

function showModal() {
    const title = document.getElementById("summary-title");
    const content = document.getElementById("summary-content");
    const confirmBtn = document.getElementById("confirm-booking-btn");

    if (title) title.innerText = currentOperation === "reserve" ? "Resumen de la Reserva" : "Resumen de la Compra";
    if (content) content.innerText = buildSummaryHTML();
    if (confirmBtn) confirmBtn.innerText = currentOperation === "reserve" ? "Confirmar Reserva" : "Confirmar Compra";

    document.getElementById("summary-modal").style.display = "flex";
}

function hideModal() {
    document.getElementById("summary-modal").style.display = "none";
}

async function continueBooking() {
    const userName = document.getElementById("user-name")?.value.trim();
    const userEmail = document.getElementById("user-email")?.value.trim();
    currentOperation = document.getElementById("operation-type")?.value || "reserve";

    if (!userName || !userEmail) {
        alert("Por favor ingresa tu nombre y correo electrónico para continuar.");
        return;
    }
    if (!userEmail.includes("@") || !userEmail.includes(".")) {
        alert("Por favor ingresa un correo electrónico válido.");
        return;
    }
    if (selectedSeats.length === 0) {
        alert("Selecciona al menos una silla.");
        return;
    }

    const ok = await revalidateSelection();
    if (!ok) return;

    showModal();
}

async function confirmBooking() {
    if (selectedSeats.length === 0 || !currentFunction) return;
    if (confirmInProgress) return;

    const confirmBtn = document.getElementById("confirm-booking-btn");
    confirmInProgress = true;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Procesando…";
    }

    try {
        const ok = await revalidateSelection();
        if (!ok) return;

        const isReserve = currentOperation === "reserve";
        const status = isReserve ? "reserved" : "sold";

        const userName = document.getElementById("user-name")?.value.trim();
        const userEmail = document.getElementById("user-email")?.value.trim();
        const priceNum = (currentFunction && currentFunction.price) || 0;
        const totalPrice = priceNum * selectedSeats.length;

        const detailedSeats = selectedSeats.map(s => ({
            seatId: s.seatId,
            seatCode: s.seatCode,
            location: s.location
        }));

        const operationPayload = {
            userName,
            email: userEmail,
            tmdbId: currentMovieId,
            functionId: currentFunction.id,
            roomId: currentRoom.id,
            quantity: selectedSeats.length,
            seats: detailedSeats,
            total: totalPrice,
            date: new Date().toISOString(),
            status: isReserve ? "confirmed" : "completed"
        };

        for (const seat of selectedSeats) {
            await updateFunctionSeatStatus(currentFunction.id, seat, status);
        }

        const saved = isReserve
            ? await saveReservation(operationPayload)
            : await savePurchase(operationPayload);

        const receiptContent = document.getElementById("receipt-content");
        if (receiptContent) {
            receiptContent.innerHTML = `
                <p><strong>${isReserve ? "Reserva" : "Compra"} N°:</strong> ${saved.id || "—"}</p>
                <p><strong>Cliente:</strong> ${userName} (${userEmail})</p>
                <p><strong>Película:</strong> ${currentMovie ? currentMovie.title : 'Cine Colombia'}</p>
                <p><strong>Sala:</strong> ${currentRoom ? currentRoom.name : 'Sala'}</p>
                <p><strong>Fecha:</strong> ${formatDate(currentFunction.date)}</p>
                <p><strong>Hora:</strong> ${currentFunction.time}</p>
                <p><strong>Sillas:</strong> ${selectedSeats.map(c => `${c.seatCode} [${c.location}]`).join(", ")}</p>
                <p><strong>Boletas:</strong> ${selectedSeats.length}</p>
                <p><strong>Precio unitario:</strong> ${formatMoney(priceNum)}</p>
                <hr>
                <p style="font-size: 1.2em; color: #d9534f;"><strong>Total Pagado:</strong> ${formatMoney(totalPrice)}</p>
            `;
        }

        hideModal();
        showSection("receipt-section");
    } catch (error) {
        console.error("Error al procesar la operación:", error);
        alert("Ocurrió un error al procesar la operación. Inténtalo de nuevo.");
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Confirmar Reserva";
        }
        confirmInProgress = false;
    }
}

/* ----------------------- Navegación ----------------------- */

function showSection(sectionId) {
    ["cartelera-section", "salas-section", "movie-detail-section", "seats-map-section", "receipt-section"]
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });

    const target = document.getElementById(sectionId);
    if (target) target.style.display = "block";
}

/* ----------------------- Eventos globales ----------------------- */

document.getElementById("back-to-movies-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    showSection("cartelera-section");
    document.getElementById("salas-section").style.display = "block";
});

document.getElementById("back-to-detail-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    hideModal();
    showSection("movie-detail-section");
});

document.getElementById("continue-booking-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    continueBooking();
});

document.getElementById("operation-type")?.addEventListener("change", () => {
    if (selectedSeats.length > 0) updateSelectedSeatsUI();
});

document.getElementById("confirm-booking-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    confirmBooking();
});

document.getElementById("cancel-booking-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    hideModal();
});

document.getElementById("finish-booking-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    selectedSeats = [];
    currentFunction = null;
    currentRoom = null;
    currentMovie = null;

    const nameInput = document.getElementById("user-name");
    const emailInput = document.getElementById("user-email");
    if (nameInput) nameInput.value = "";
    if (emailInput) emailInput.value = "";

    hideModal();
    updateSelectedSeatsUI();
    showSection("cartelera-section");
    document.getElementById("salas-section").style.display = "block";
});

document.getElementById("search-input")?.addEventListener("input", () => {
    renderMovies(getFilteredMovies());
});

/* ----------------------- Navegación rápida ----------------------- */

function switchCatalog(source) {
    if (source === activeCatalog && document.getElementById("cartelera-section").style.display !== "none") return;
    const searchInput = document.getElementById("search-input");
    const genreSelect = document.getElementById("genre-filter");
    if (searchInput) searchInput.value = "";
    if (genreSelect) genreSelect.value = "";
    hideModal();
    showSection("cartelera-section");
    document.getElementById("salas-section").style.display = "block";
    loadMovies(source);
}

document.getElementById("nav-cartelera")?.addEventListener("click", (e) => {
    e.preventDefault();
    const title = document.getElementById("cartelera-title");
    if (title) title.textContent = "Películas en Cartelera";
    switchCatalog("cartelera");
});

document.getElementById("nav-explorar")?.addEventListener("click", (e) => {
    e.preventDefault();
    const title = document.getElementById("cartelera-title");
    if (title) title.textContent = "Consulta General — Explorar Películas";
    switchCatalog("explorar");
});

document.getElementById("nav-salas")?.addEventListener("click", (e) => {
    e.preventDefault();
    hideModal();
    showSection("cartelera-section");
    document.getElementById("salas-section").style.display = "block";
    document.getElementById("salas-section").scrollIntoView({ behavior: "smooth" });
});

const trailerModal = document.getElementById("trailer-modal");
document.getElementById("trailer-close-btn")?.addEventListener("click", () => closeTrailerModal());
trailerModal?.addEventListener("click", (e) => {
    if (e.target === trailerModal) closeTrailerModal();
});

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

    await loadAndRenderRatings(currentMovieId);
});

/* ----------------------- Inicialización ----------------------- */

async function loadMovies(source = "cartelera") {
    activeCatalog = source;
    try {
        allMovies = source === "explorar"
            ? await getPopularMovies()
            : await getNowPlayingMovies();
    } catch (error) {
        console.error("Error cargando la cartelera:", error);
        const moviesContainer = document.getElementById("movies-container");
        if (moviesContainer) {
            moviesContainer.innerHTML = '<p style="color:#d9534f; text-align:center; padding:1em;">No se pudieron cargar las películas. Verifica la conexión a The Movie Database e inténtalo de nuevo.</p>';
        }
        return;
    }
    renderMovies(allMovies);
}

loadRooms().catch(e => console.error("Error cargando salas:", e));
loadGenres();
loadMovies();