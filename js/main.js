import {
    getRooms,
    getNowPlayingMovies,
    getPopularMovies,
    getMovieGenres,
    getMovieDetails,
    getMovieCredits,
    getMovieTrailers,
    getPersonDetails,
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
    getRatingsByMovie,
    getPromoByCode,
    getUserByEmail,
    saveUser
} from "./api.js";

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const PROFILE_BASE_URL = "https://image.tmdb.org/t/p/w185";

const SEAT_TYPE_MULTIPLIERS = { standard: 1, premium: 1.25, vip: 1.5 };

let allMovies = [];
let allGenres = [];
let selectedSeats = [];            // [{ seatId, seatCode, location, type }]
let currentMovieId = null;
let currentMovie = null;           // Objeto completo de TMDB
let currentFunction = null;        // Función seleccionada (JSON Server)
let currentRoom = null;            // Sala de la función
let currentOperation = "purchase"; // "reserve" | "purchase"
let currentUser = null;            // Usuario autenticado
let appliedPromo = null;           // Promoción aplicada a la compra actual
let currentCard = null;            // Tarjeta validada { brand, last4, holder }
let loginRetry = false;            // Reanuda la compra tras iniciar sesión
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

    return `${verticalLoc} ${horizontalLoc}`.trim();
}

function getSeatLocation(seat) {
    if (seat && seat.location) return seat.location;
    const code = seat && seat.seatCode ? seat.seatCode : "";
    return fallbackSeatLocation(code, currentRoom ? currentRoom.seatsPerRow : 6);
}

function getTypeLabel(type) {
    const labels = { standard: "Standard", premium: "Premium", vip: "VIP" };
    return labels[(type || "standard").toLowerCase()] || "Standard";
}

/* ----------------------- Precios ----------------------- */

function seatUnitPrice(type) {
    const base = (currentFunction && currentFunction.price) || 0;
    const multiplier = SEAT_TYPE_MULTIPLIERS[(type || "standard").toLowerCase()] || 1;
    return Math.round(base * multiplier);
}

function calculateTotal() {
    const items = selectedSeats.map(s => ({
        seatId: s.seatId,
        seatCode: s.seatCode,
        type: (s.type || "standard").toLowerCase(),
        price: seatUnitPrice(s.type)
    }));
    const subtotal = items.reduce((sum, it) => sum + it.price, 0);
    const discount = appliedPromo
        ? Math.round(subtotal * ((appliedPromo.discount || 0) / 100))
        : 0;
    const total = Math.max(0, subtotal - discount);
    return { items, subtotal, discount, total };
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
            <div class="image-wrap">
                <img src="${posterUrl}" alt="Póster de ${movie.title}">
            </div>
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

/* ----------------------- Autenticación ----------------------- */

function openLoginModal(message) {
    const modal = document.getElementById("login-modal");
    const err = document.getElementById("login-error");
    if (err) {
        err.textContent = message || "";
        err.className = message ? "login-error login-error-info" : "login-error";
    }
    if (modal) modal.style.display = "flex";
}

function closeLoginModal() {
    const modal = document.getElementById("login-modal");
    if (modal) modal.style.display = "none";
}

function updateAuthUI() {
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const badge = document.getElementById("user-badge-name");
    if (currentUser) {
        if (loginBtn) loginBtn.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "inline-flex";
        if (badge) badge.textContent = currentUser.name || currentUser.email;
    } else {
        if (loginBtn) loginBtn.style.display = "inline-flex";
        if (logoutBtn) logoutBtn.style.display = "none";
        if (badge) badge.textContent = "";
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();

    const name = document.getElementById("login-name").value.trim();
    const email = document.getElementById("login-email").value.trim();
    const errEl = document.getElementById("login-error");

    if (!name || !email) {
        errEl.textContent = "Ingresa tu nombre y correo electrónico.";
        errEl.className = "login-error";
        return;
    }
    if (!email.includes("@") || !email.includes(".")) {
        errEl.textContent = "Ingresa un correo electrónico válido.";
        errEl.className = "login-error";
        return;
    }

    try {
        const existing = await getUserByEmail(email);
        if (existing) {
            currentUser = existing;
        } else {
            const created = await saveUser({ name, email });
            currentUser = (created && created.id) ? created : { name, email };
        }
    } catch (error) {
        console.warn("No se pudo guardar el usuario, sesión local:", error);
        currentUser = { name, email };
    }

    const nameInput = document.getElementById("user-name");
    const emailInput = document.getElementById("user-email");
    if (nameInput) nameInput.value = currentUser.name || name;
    if (emailInput) emailInput.value = currentUser.email || email;

    updateAuthUI();
    closeLoginModal();
    document.getElementById("login-form").reset();

    if (loginRetry) {
        loginRetry = false;
        continueBooking();
    }
}

function logoutUser() {
    currentUser = null;
    const nameInput = document.getElementById("user-name");
    const emailInput = document.getElementById("user-email");
    if (nameInput) nameInput.value = "";
    if (emailInput) emailInput.value = "";
    updateAuthUI();
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
    const cast = (credits && credits.cast.slice(0, 10)) || [];

    const castGalleryHTML = cast.length > 0
        ? `<div class="cast-gallery">${cast.map(p => {
            const photo = p.profile_path
                ? `${PROFILE_BASE_URL}${p.profile_path}`
                : 'https://via.placeholder.com/185x278?text=Sin+Foto';
            return `
                <div class="cast-card" data-person-id="${p.id}">
                    <img src="${photo}" alt="Foto de ${p.name}" loading="lazy" class="cast-photo">
                    <div class="cast-info">
                        <strong>${p.name}</strong>
                        <span class="cast-character">como ${p.character || "—"}</span>
                        <button type="button" class="person-btn secondary-btn" data-person-id="${p.id}" data-person-name="${(p.name || "").replace(/"/g, "&quot;")}">Ver biografía</button>
                    </div>
                </div>
            `;
        }).join("")}</div>`
        : "<p>Sin información.</p>";

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
                <p><strong>💵 Precio base:</strong> ${formatMoney(fn.price)}</p>
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
            <div class="cast-section">
                <h3>Reparto / Actores</h3>
                ${castGalleryHTML}
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

    document.querySelectorAll(".person-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const personId = e.currentTarget.getAttribute("data-person-id");
            openPersonModal(personId);
        });
    });

    document.querySelectorAll(".select-function-btn[data-function-id]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const functionId = e.currentTarget.getAttribute("data-function-id");
            const roomId = e.currentTarget.getAttribute("data-room-id");
            showSeatsMap(functionId, roomId);
        });
    });
}

async function openPersonModal(personId) {
    const modal = document.getElementById("person-modal");
    const content = document.getElementById("person-content");
    if (!modal || !content) return;

    content.innerHTML = `<div class="person-loading"><div class="spinner"></div> <span>Cargando información del actor…</span></div>`;
    modal.style.display = "flex";

    try {
        const person = await getPersonDetails(personId);

        const photo = person.profile_path
            ? `<img src="https://image.tmdb.org/t/p/w400${person.profile_path}" alt="Foto de ${person.name}">`
            : `<div class="person-bio-photo-fallback">🎭<br>${(person.name || "").split(" ")[0] || "Actor"}</div>`;

        const birthday = person.birthday ? formatDate(person.birthday) : "—";
        const dept = person.known_for_department ? person.known_for_department : "Actor";

        content.innerHTML = `
            <div class="person-bio">
                <div class="person-bio-photo">
                    ${photo}
                </div>
                <div class="person-bio-info">
                    <h3>${person.name}</h3>
                    <p class="person-extra"><span>🎭</span> ${dept}</p>
                    <p class="person-extra"><span>🎂</span> Nacimiento: ${birthday}${person.place_of_birth ? ` · ${person.place_of_birth}` : ""}</p>
                    ${person.also_known_as && person.also_known_as.length
                        ? `<p class="person-extra"><span>⭐</span> También conocido como: ${person.also_known_as.slice(0, 4).join(", ")}</p>`
                        : ""}
                    <p class="person-extra"><span>📈</span> Popularidad: ${person.popularity ? Math.round(person.popularity) : "—"}</p>
                    <div class="person-bio-text">
                        <strong>Biografía</strong>
                        <p>${person.biography && person.biography.trim() ? person.biography : "No hay biografía disponible para este actor."}</p>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error al cargar la biografía:", error);
        content.innerHTML = `<p class="person-error">No se pudo cargar la información del actor. Inténtalo de nuevo.</p>`;
    }
}

function closePersonModal() {
    const modal = document.getElementById("person-modal");
    if (modal) modal.style.display = "none";
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
    appliedPromo = null;
    currentOperation = "purchase";
    currentCard = null;

    const opSelect = document.getElementById("operation-type");
    if (opSelect) opSelect.value = "purchase";
    const paymentSelect = document.getElementById("payment-method");
    if (paymentSelect) paymentSelect.value = "";
    hideCardForm();
    clearCardErrors();
    resetCardInputs();
    const promoInput = document.getElementById("promo-input");
    if (promoInput) promoInput.value = "";
    resetPromoUI();

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
            const type = (seat.type || "standard").toLowerCase();

            const seatBtn = document.createElement("button");
            seatBtn.type = "button";
            seatBtn.classList.add("seat-btn", status, `seat-type-${type}`);
            seatBtn.innerText = seat.seatCode;
            seatBtn.dataset.seatId = seat.id;
            seatBtn.dataset.seatCode = seat.seatCode;
            seatBtn.dataset.type = type;
            seatBtn.dataset.location = seat.location || fallbackSeatLocation(seat.seatCode);
            seatBtn.title = `Asiento ${seat.seatCode} — ${getTypeLabel(type)} — ${statusLabel(status)} (${seatBtn.dataset.location})`;
            seatBtn.setAttribute("aria-label", `Asiento ${seat.seatCode}, tipo ${type}, ${status}, ${seatBtn.dataset.location}`);

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
            Precio base ${formatMoney(currentFunction.price)} ·
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
    const location = seat.location || fallbackSeatLocation(seat.seatCode);
    const type = (seat.type || "standard").toLowerCase();

    if (isSelected) {
        selectedSeats = selectedSeats.filter(s => s.seatId !== seat.id);
        seatBtn.classList.remove("selected");
        seatBtn.classList.add("available");
        seatBtn.title = `Asiento ${seat.seatCode} — ${getTypeLabel(type)} — Disponible (${location})`;
    } else {
        selectedSeats.push({ seatId: seat.id, seatCode: seat.seatCode, location, type });
        seatBtn.classList.remove("available");
        seatBtn.classList.add("selected");
        seatBtn.title = `Asiento ${seat.seatCode} — ${getTypeLabel(type)} — Seleccionado (${location})`;
    }
    updateSelectedSeatsUI();
}

function buildPriceBreakdown(items, subtotal, discount, total) {
    let html = items.map(it => `
        <div class="price-line">
            <span>${it.seatCode} <span class="type-badge type-${it.type}">${getTypeLabel(it.type)}</span></span>
            <span>${formatMoney(it.price)}</span>
        </div>
    `).join("");

    html += `<div class="price-line price-subtotal"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>`;

    if (appliedPromo) {
        html += `<div class="price-line price-discount"><span>Descuento (${appliedPromo.code} · ${appliedPromo.discount}%)</span><span>− ${formatMoney(discount)}</span></div>`;
    }

    html += `<div class="price-line price-total"><span>Total</span><span>${formatMoney(total)}</span></div>`;

    return html;
}

function updateSelectedSeatsUI() {
    const textSpan = document.getElementById("selected-seats-text");
    const detailSpan = document.getElementById("selected-seats-detail");
    const ticketsSpan = document.getElementById("total-tickets-display");
    const subtotalSpan = document.getElementById("subtotal-display");
    const warningP = document.getElementById("reserve-warning");
    const continueBtn = document.getElementById("continue-booking-btn");
    const priceBox = document.getElementById("price-breakdown");

    if (selectedSeats.length === 0) {
        if (textSpan) textSpan.innerText = "Ninguna";
        if (detailSpan) detailSpan.innerHTML = "";
        if (ticketsSpan) ticketsSpan.innerText = "0";
        if (subtotalSpan) subtotalSpan.innerText = "$0";
        if (priceBox) priceBox.innerHTML = "";
        if (warningP) warningP.innerHTML = "";
        if (continueBtn) continueBtn.disabled = true;
        return;
    }

    const { items, subtotal, discount, total } = calculateTotal();

    if (textSpan) textSpan.innerText = selectedSeats.map(s => s.seatCode).join(", ");

    if (detailSpan) {
        detailSpan.innerHTML = selectedSeats.map(s => `
            <span class="seat-chip">
                ${s.seatCode} · <span class="type-badge type-${(s.type || "standard").toLowerCase()}">${getTypeLabel(s.type)}</span> · ${s.location}
            </span>
        `).join(" ");
    }

    if (ticketsSpan) ticketsSpan.innerText = String(selectedSeats.length);
    if (subtotalSpan) subtotalSpan.innerText = formatMoney(subtotal);
    if (priceBox) priceBox.innerHTML = buildPriceBreakdown(items, subtotal, discount, total);
    if (warningP) warningP.innerHTML = `La cantidad de tickets (${selectedSeats.length}) debe coincidir con el número de sillas seleccionadas.`;
    if (continueBtn) continueBtn.disabled = false;
}

/* ----------------------- Código promocional ----------------------- */

function resetPromoUI() {
    const input = document.getElementById("promo-input");
    const applyBtn = document.getElementById("apply-promo-btn");
    const clearBtn = document.getElementById("clear-promo-btn");
    const feedback = document.getElementById("promo-feedback");

    if (input) { input.value = ""; input.disabled = false; }
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = "Aplicar"; }
    if (clearBtn) clearBtn.style.display = "none";
    if (feedback) { feedback.textContent = ""; feedback.className = "promo-feedback"; }
    appliedPromo = null;
}

async function applyPromo() {
    const input = document.getElementById("promo-input");
    const applyBtn = document.getElementById("apply-promo-btn");
    const clearBtn = document.getElementById("clear-promo-btn");
    const feedback = document.getElementById("promo-feedback");

    const code = (input?.value || "").trim().toUpperCase();

    if (!code) {
        if (feedback) { feedback.textContent = "Ingresa un código promocional."; feedback.className = "promo-feedback promo-error"; }
        return;
    }

    if (appliedPromo) {
        if (feedback) { feedback.textContent = "El código ya fue aplicado a esta compra."; feedback.className = "promo-feedback promo-warning"; }
        return;
    }

    try {
        const promo = await getPromoByCode(code);

        if (!promo || !promo.active) {
            if (feedback) { feedback.textContent = "Código promocional inválido"; feedback.className = "promo-feedback promo-error"; }
            return;
        }

        appliedPromo = promo;
        if (input) { input.disabled = true; input.classList.add("promo-input-applied"); }
        if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = "✔ Aplicado"; }
        if (clearBtn) clearBtn.style.display = "inline-block";
        if (feedback) {
            feedback.innerHTML = `<span>✅ Código <strong>${promo.code}</strong> aplicado: <strong>${promo.discount}%</strong> de descuento.</span>`;
            feedback.className = "promo-feedback promo-success";
        }
        updateSelectedSeatsUI();
    } catch (error) {
        console.error("Error al validar el código promocional:", error);
        if (feedback) { feedback.textContent = "Código promocional inválido"; feedback.className = "promo-feedback promo-error"; }
    }
}

function clearPromo() {
    appliedPromo = null;
    const input = document.getElementById("promo-input");
    const applyBtn = document.getElementById("apply-promo-btn");
    const clearBtn = document.getElementById("clear-promo-btn");
    const feedback = document.getElementById("promo-feedback");

    if (input) { input.value = ""; input.disabled = false; input.classList.remove("promo-input-applied"); }
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = "Aplicar"; }
    if (clearBtn) clearBtn.style.display = "none";
    if (feedback) { feedback.textContent = ""; feedback.className = "promo-feedback"; }
    updateSelectedSeatsUI();
}

/* ----------------------- Tarjeta de pago ----------------------- */

function showCardForm() {
    const form = document.getElementById("card-payment-form");
    if (form) form.style.display = "block";
    updateCardBrandUI("");
}

function hideCardForm() {
    const form = document.getElementById("card-payment-form");
    if (form) form.style.display = "none";
}

function resetCardInputs() {
    document.getElementById("card-number").value = "";
    document.getElementById("card-expiry").value = "";
    document.getElementById("card-cvv").value = "";
    document.getElementById("card-holder").value = "";
}

function clearCardErrors() {
    ["card-number-error", "card-expiry-error", "card-cvv-error", "card-holder-error"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "";
    });
    ["card-number", "card-expiry", "card-cvv", "card-holder"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("input-invalid");
    });
}

function setFieldError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (input) input.classList.toggle("input-invalid", Boolean(message));
    if (error) error.textContent = message || "";
}

function detectCardBrand(cardNumber) {
    const n = String(cardNumber || "").replace(/\D/g, "");
    if (/^4/.test(n)) return { name: "Visa", code: "visa" };
    if (/^(5[1-5]\d{2}|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(n)) return { name: "Mastercard", code: "mastercard" };
    if (/^3[47]/.test(n)) return { name: "American Express", code: "amex" };
    if (/^(3(0[0-5]|[68])\d)/.test(n)) return { name: "Diners Club", code: "diners" };
    if (/^6(011|5)/.test(n)) return { name: "Discover", code: "discover" };
    return null;
}

function luhnCheck(cardNumber) {
    const digits = String(cardNumber || "").replace(/\D/g, "");
    if (!/^\d+$/.test(digits)) return false;
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = parseInt(digits[i], 10);
        if (double) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
        double = !double;
    }
    return sum % 10 === 0;
}

function formatCardNumberInput(value) {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiryInput(value) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return digits.slice(0, 2) + "/" + digits.slice(2);
}

function updateCardBrandUI(cardNumber) {
    const brand = detectCardBrand(cardNumber);
    const label = document.getElementById("card-brand-label");
    const chips = document.querySelectorAll(".brand-chip");

    if (label) {
        if (cardNumber.trim() === "") {
            label.textContent = "💳 Tarjeta";
        } else if (brand) {
            label.innerHTML = `💳 <strong>${brand.name}</strong>`;
        } else {
            label.textContent = "💳 ¿Visa, Mastercard …?";
        }
    }

    chips.forEach(chip => {
        const active = brand && chip.dataset.brand === brand.code;
        chip.classList.toggle("brand-active", active);
        chip.classList.toggle("brand-dim", Boolean(cardNumber.trim()) && !active && brand !== null);
    });
}

function validateCard() {
    const number = document.getElementById("card-number").value.trim();
    const expiry = document.getElementById("card-expiry").value.trim();
    const cvv = document.getElementById("card-cvv").value.trim();
    const holder = document.getElementById("card-holder").value.trim();

    const digits = number.replace(/\D/g, "");
    let hasError = false;

    if (!digits) {
        setFieldError("card-number", "card-number-error", "Ingresa el número de tarjeta.");
        hasError = true;
    } else if (!/^\d{13,16}$/.test(digits)) {
        setFieldError("card-number", "card-number-error", "El número de tarjeta debe tener entre 13 y 16 dígitos.");
        hasError = true;
    } else if (!luhnCheck(digits)) {
        setFieldError("card-number", "card-number-error", "El número de tarjeta no es válido (falla el algoritmo de validación).");
        hasError = true;
    } else {
        const brand = detectCardBrand(digits);
        if (!brand) {
            setFieldError("card-number", "card-number-error", "Tipo de tarjeta no reconocido. Ingresa Visa, Mastercard, Amex, Diners o Discover.");
            hasError = true;
        } else {
            setFieldError("card-number", "card-number-error", "");
        }
    }

    const expiryDigits = expiry.replace(/\D/g, "");
    if (expiryDigits.length !== 4) {
        setFieldError("card-expiry", "card-expiry-error", "Ingresa la fecha en formato MM/AA.");
        hasError = true;
    } else {
        const mm = parseInt(expiryDigits.slice(0, 2), 10);
        const yy = parseInt(expiryDigits.slice(2), 10);
        if (mm < 1 || mm > 12) {
            setFieldError("card-expiry", "card-expiry-error", "El mes debe estar entre 01 y 12.");
            hasError = true;
        } else {
            const now = new Date();
            const currentMonth = now.getFullYear() * 12 + now.getMonth();
            const expiryMonth = (2000 + yy) * 12 + (mm - 1);
            if (expiryMonth < currentMonth) {
                setFieldError("card-expiry", "card-expiry-error", "La tarjeta está vencida.");
                hasError = true;
            } else {
                setFieldError("card-expiry", "card-expiry-error", "");
            }
        }
    }

    const brandForCvv = detectCardBrand(digits);
    const cvvExpected = brandForCvv && brandForCvv.code === "amex" ? 4 : 3;
    if (!/^\d+$/.test(cvv) || cvv.length !== cvvExpected) {
        setFieldError("card-cvv", "card-cvv-error", cvv.length === 0
            ? "Ingresa el código de seguridad."
            : `El CVV debe tener ${cvvExpected} dígitos${cvvExpected === 4 ? " (American Express)" : ""}.`);
        hasError = true;
    } else {
        setFieldError("card-cvv", "card-cvv-error", "");
    }

    if (holder.length < 3) {
        setFieldError("card-holder", "card-holder-error", "Ingresa el nombre tal como aparece en la tarjeta.");
        hasError = true;
    } else {
        setFieldError("card-holder", "card-holder-error", "");
    }

    if (hasError) return null;

    const brand = detectCardBrand(digits);
    return {
        brand: brand.name,
        brandCode: brand.code,
        last4: digits.slice(-4),
        holder,
        masked: `•••• •••• •••• ${digits.slice(-4)}`
    };
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
    const { items, subtotal, discount, total } = calculateTotal();
    const paymentMethod = document.getElementById("payment-method")?.value || "";
    const paymentLabel = paymentMethod
        ? paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)
        : "—";

    const seatsLines = items.map(it => `${it.seatCode} ${getTypeLabel(it.type)} ${formatMoney(it.price)}`).join("\n");

    let txt = `--------------------------------\n`;
    txt += `${isReserve ? "RESUMEN DE LA RESERVA" : "RESUMEN DE LA COMPRA"}\n`;
    txt += `--------------------------------\n\n`;
    txt += `Película: ${currentMovie ? currentMovie.title : "—"}\n`;
    txt += `Sala: ${currentRoom ? currentRoom.name : "—"}\n`;
    txt += `Fecha: ${formatDate(currentFunction && currentFunction.date)}\n`;
    txt += `Hora: ${currentFunction ? currentFunction.time : "—"}\n\n`;
    txt += `Asientos:\n${seatsLines}\n\n`;
    txt += `Cantidad de tickets: ${selectedSeats.length}\n`;
    txt += `Subtotal: ${formatMoney(subtotal)}\n`;

    if (appliedPromo) {
        txt += `Descuento (${appliedPromo.code} ${appliedPromo.discount}%): − ${formatMoney(discount)}\n`;
    }

    txt += `Total: ${formatMoney(total)}\n`;

    if (!isReserve) {
        txt += `Método de pago: ${paymentLabel}\n`;
        if (paymentMethod === "tarjeta" && currentCard) {
            txt += `Tarjeta: ${currentCard.brand} ${currentCard.masked}\n`;
        }
    }

    return txt;
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
    if (!currentUser) {
        loginRetry = true;
        openLoginModal("Inicia sesión para continuar con tus reservas y compras.");
        return;
    }

    currentOperation = document.getElementById("operation-type")?.value || "purchase";

    if (selectedSeats.length === 0) {
        alert("Selecciona al menos una silla.");
        return;
    }

    const paymentMethod = document.getElementById("payment-method")?.value || "";

    if (currentOperation === "purchase" && !paymentMethod) {
        alert("Selecciona un método de pago (Tarjeta, Efectivo o PSE) para continuar.");
        return;
    }

    if (currentOperation === "purchase" && paymentMethod === "tarjeta") {
        const card = validateCard();
        if (!card) {
            alert("Revisa los datos de la tarjeta. Corrige los campos marcados en rojo.");
            return;
        }
        currentCard = card;
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
        const { items, subtotal, discount, total } = calculateTotal();
        const paymentMethod = document.getElementById("payment-method")?.value || "";

        if (!isReserve && paymentMethod === "tarjeta") {
            const card = validateCard();
            if (!card) {
                alert("Revisa los datos de la tarjeta antes de confirmar la compra.");
                return;
            }
            currentCard = card;
        }

        const userName = (document.getElementById("user-name")?.value.trim()) || (currentUser && currentUser.name);
        const userEmail = (document.getElementById("user-email")?.value.trim()) || (currentUser && currentUser.email);

        const detailedSeats = items.map(it => {
            const sel = selectedSeats.find(s => s.seatId === it.seatId) || {};
            return {
                seatId: it.seatId,
                seatCode: it.seatCode,
                type: it.type,
                price: it.price,
                location: sel.location || ""
            };
        });

        const operationPayload = {
            userName,
            email: userEmail,
            tmdbId: currentMovieId,
            functionId: currentFunction.id,
            roomId: currentRoom.id,
            quantity: selectedSeats.length,
            seats: detailedSeats,
            subtotal,
            discount,
            total,
            paymentMethod: isReserve ? "" : paymentMethod,
            card: (!isReserve && paymentMethod === "tarjeta" && currentCard)
                ? { brand: currentCard.brand, last4: currentCard.last4 }
                : null,
            promoCode: appliedPromo ? appliedPromo.code : null,
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
            const seatsHTML = detailedSeats.map(s => `
                <tr>
                    <td>${s.seatCode}</td>
                    <td><span class="type-badge type-${s.type}">${getTypeLabel(s.type)}</span></td>
                    <td class="row-right">${formatMoney(s.price)}</td>
                </tr>
            `).join("");

            const paymentLabel = paymentMethod
                ? paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)
                : "—";
            const dateTime = `${formatDate(currentFunction.date)} · ${currentFunction.time}h`;

            receiptContent.innerHTML = `
                <div class="ticket">
                    <div class="ticket-head">
                        <div class="ticket-brand">🎬 CINE COLOMBIA</div>
                        <div class="ticket-type">${isReserve ? "BOLETA · RESERVA" : "BOLETA · COMPRA"}</div>
                    </div>
                    <div class="ticket-movie">
                        <div class="ticket-movie-title">${currentMovie ? currentMovie.title : "Película"}</div>
                        <div class="ticket-movie-meta">${currentRoom ? currentRoom.name : "Sala"} · ${dateTime}</div>
                    </div>
                    <div class="ticket-info-grid">
                        <div><span>N° ${isReserve ? "Reserva" : "Compra"}</span><strong>${saved.id || "—"}</strong></div>
                        <div><span>Boletas</span><strong>${selectedSeats.length}</strong></div>
                        <div><span>Cliente</span><strong>${userName}</strong></div>
                        <div><span>Correo</span><strong>${userEmail}</strong></div>
                    </div>
                    <table class="ticket-table">
                        <thead>
                            <tr><th>Asiento</th><th>Tipo</th><th class="row-right">Precio</th></tr>
                        </thead>
                        <tbody>${seatsHTML}</tbody>
                    </table>
                    <div class="ticket-totals">
                        <div class="t-row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
                        ${appliedPromo
                            ? `<div class="t-row t-discount"><span>Descuento (${appliedPromo.code} ${appliedPromo.discount}%)</span><span>− ${formatMoney(discount)}</span></div>`
                            : ""}
                        <div class="t-row t-grand"><span>Total ${isReserve ? "a pagar" : "pagado"}</span><span>${formatMoney(total)}</span></div>
                    </div>
                    ${!isReserve ? `
                    <div class="ticket-payment">
                        <div class="t-pay-item"><span>Método de pago</span><strong>${paymentLabel}</strong></div>
                        ${paymentMethod === "tarjeta" && currentCard
                            ? `<div class="t-pay-item"><span>Tarjeta</span><strong>${currentCard.brand} ${currentCard.masked}</strong></div>`
                            : ""}
                        ${paymentMethod === "tarjeta" && currentCard
                            ? `<div class="t-pay-item"><span>Titular</span><strong>${currentCard.holder}</strong></div>`
                            : ""}
                    </div>`
                    : ""}
                    <div class="ticket-barcode">||||||||||||||||||||| |||||||||||||||||||||| ||||||||||||</div>
                    <div class="ticket-foot">🐮 Gracias por tu compra. Presenta este comprobante en taquilla · ${new Date().toLocaleDateString("es-CO")}</div>
                </div>
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
            confirmBtn.textContent = currentOperation === "reserve" ? "Confirmar Reserva" : "Confirmar Compra";
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

document.getElementById("payment-method")?.addEventListener("change", () => {
    const method = document.getElementById("payment-method").value;
    if (method === "tarjeta") {
        showCardForm();
        updateCardBrandUI(document.getElementById("card-number").value);
    } else {
        hideCardForm();
        clearCardErrors();
    }
    if (selectedSeats.length > 0) updateSelectedSeatsUI();
});

document.getElementById("card-number")?.addEventListener("input", (e) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    e.target.value = formatCardNumberInput(digits);
    updateCardBrandUI(e.target.value);
    setFieldError("card-number", "card-number-error", "");
});

document.getElementById("card-expiry")?.addEventListener("input", (e) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    e.target.value = formatExpiryInput(digits);
    setFieldError("card-expiry", "card-expiry-error", "");
});

document.getElementById("card-cvv")?.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setFieldError("card-cvv", "card-cvv-error", "");
});

document.getElementById("card-holder")?.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑÜ\s.-]/gi, "");
    setFieldError("card-holder", "card-holder-error", "");
});

document.getElementById("apply-promo-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    applyPromo();
});

document.getElementById("promo-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        applyPromo();
    }
});

document.getElementById("clear-promo-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    clearPromo();
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
    appliedPromo = null;
    currentCard = null;

    const paymentSelect = document.getElementById("payment-method");
    if (paymentSelect) paymentSelect.value = "";
    hideCardForm();
    clearCardErrors();
    resetCardInputs();
    resetPromoUI();

    hideModal();
    updateSelectedSeatsUI();
    showSection("cartelera-section");
    document.getElementById("salas-section").style.display = "block";
});

document.getElementById("search-input")?.addEventListener("input", () => {
    renderMovies(getFilteredMovies());
});

/* ----------------------- Autenticación: eventos ----------------------- */

document.getElementById("login-btn")?.addEventListener("click", () => openLoginModal());
document.getElementById("logout-btn")?.addEventListener("click", () => logoutUser());
document.getElementById("login-close-btn")?.addEventListener("click", () => closeLoginModal());

const loginModalEl = document.getElementById("login-modal");
loginModalEl?.addEventListener("click", (e) => {
    if (e.target === loginModalEl) closeLoginModal();
});

document.getElementById("login-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleLoginSubmit(e);
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

const personModal = document.getElementById("person-modal");
document.getElementById("person-close-btn")?.addEventListener("click", () => closePersonModal());
personModal?.addEventListener("click", (e) => {
    if (e.target === personModal) closePersonModal();
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

/* ----------------------- Footer ----------------------- */

document.getElementById("footer-nav-cartelera")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchCatalog("cartelera");
});

document.getElementById("footer-nav-salas")?.addEventListener("click", (e) => {
    e.preventDefault();
    showSection("cartelera-section");
    document.getElementById("salas-section").style.display = "block";
    document.getElementById("salas-section").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("footer-open-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    openLoginModal();
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

updateAuthUI();
loadRooms().catch(e => console.error("Error cargando salas:", e));
loadGenres();
loadMovies();