# 🎬 Cine Colombia - Plataforma de Reservas & Cartelera (Netflix Edition)

Link a la pagina: https://cartelera-project.netlify.app/
¡Bienvenido al sistema de gestión y reserva de entradas para cine! 🎥

Esta aplicación web interactiva permite consultar la cartelera de películas, seleccionar salas, elegir asientos mediante un mapa interactivo y procesar reservas con la generación de un comprobante digital.

El diseño está inspirado en las plataformas de streaming modernas, especialmente en el estilo **Netflix / Dark Mode**, integrando efectos de iluminación neón, microinteracciones y animaciones fluidas mediante CSS.

---

## 🛠️ Estructura del Proyecto

```text
cartelera-project/
├── css/
│   └── style.css            # Estilos globales, variables CSS y tema oscuro
├── js/
│   ├── api.js               # Peticiones HTTP mediante Fetch API / JSON-Server
│   ├── config.js            # Variables de configuración y endpoints de la API
│   └── main.js              # Lógica de la aplicación, eventos y renderizado
├── db.json                  # Base de datos local (JSON-Server)
├── index.html               # Estructura semántica principal HTML5
├── package.json             # Configuración de dependencias y scripts
├── package-lock.json        # Registro exacto de versiones de paquetes
└── README.md                # Documentación del proyecto
```

---

## 🚀 Características y Funcionalidades

### 🎥 1. Cartelera y Detalles de Películas
* **Renderizado dinámico:** Consulta la base de datos para cargar de forma asíncrona las películas disponibles.
* **Filtro de búsqueda:** Buscador integrado que permite filtrar las películas en tiempo real por título.
* **Información detallada:** Visualización completa de cada título:
  * 🎞️ Póster
  * 📝 Sinopsis
  * ⏱️ Duración
  * 🎭 Género
  * ⭐ Sistema de valoraciones

### 🛋️ 2. Gestión de Salas y Asientos
* **Consultas de salas:** Muestra las salas asignadas para cada función junto con su respectiva capacidad.
* **Mapa interactivo de asientos:** Matriz de sillas interactiva con diferentes estados visuales.

#### 🎨 Estados de los Asientos

| Estado | Color | Descripción |
| :--- | :--- | :--- |
| 🟢 **Disponible** | Verde / Gris oscuro | Asiento disponible para seleccionar |
| 🟡 **Seleccionado** | Amarillo brillante | Asiento elegido por el usuario con efecto *glow* |
| 🔴 **Ocupado / Vendido** | Rojo oscuro | Asiento reservado y deshabilitado |

### 🎟️ 3. Flujo de Reserva y Comprobante
El sistema permite realizar todo el proceso de reserva de manera interactiva:
1. Seleccionar una película.
2. Consultar las funciones disponibles.
3. Seleccionar una sala.
4. Elegir los asientos disponibles.
5. Validar la cantidad de sillas seleccionadas.
6. Calcular automáticamente el precio total.
7. Registrar los datos del comprador.
8. Confirmar la reserva.
9. Generar un comprobante digital con los detalles de la compra.

#### 👤 Formulario de Usuario
El formulario solicita información básica del comprador:
* Nombre
* Correo electrónico

#### 🧾 Generación del Ticket
Al confirmar la compra, el sistema procesa la reserva y muestra un comprobante digital con la siguiente información:
* 🎬 Película
* 🏢 Sala
* 📅 Fecha
* 🕐 Hora de la función
* 💺 Asientos seleccionados
* 👤 Nombre del comprador
* 📧 Correo electrónico
* 💰 Precio total de la reserva

---

## 💻 Tecnologías Utilizadas

### HTML5
* Utilizado para construir la estructura semántica de la aplicación web.

### CSS3
Se utilizan diferentes características modernas de CSS:
* Variables CSS mediante `:root`
* Flexbox y CSS Grid
* Diseño Responsive
* Animaciones con `@keyframes` y transiciones
* Efectos de iluminación *glow*
* Tema oscuro inspirado en Netflix

### JavaScript ES6+
La lógica de la aplicación está desarrollada utilizando:
* Módulos nativos mediante `import` / `export`
* `async` / `await` y Fetch API
* Manipulación del DOM y eventos interactivos
* Renderizado dinámico
* Validación de formularios

### JSON-Server / Node.js
* Se utiliza **JSON-Server** como una API REST simulada para representar el backend de la aplicación y permitir la persistencia de los datos de manera local.

---

## ⚙️ Requisitos e Instalación

Antes de comenzar, asegúrate de tener instalados:
* Node.js y npm
* Visual Studio Code
* Extensión **Live Server** para VS Code

### 📥 1. Clonar el repositorio
```bash
git clone <URL_DE_TU_REPOSITORIO>
cd cartelera-project
```

### 📦 2. Instalar las dependencias
Ejecuta el siguiente comando en la raíz del proyecto:
```bash
npm install
```

### 🗄️ 3. Iniciar el servidor local
Para iniciar el backend simulado mediante JSON-Server:
```bash
npx json-server --watch db.json --port 3000
```
El servidor estará disponible en: [http://localhost:3000](http://localhost:3000)

### 🌐 4. Ejecutar el Frontend
1. Abre el proyecto en Visual Studio Code.
2. Abre el archivo `index.html`.
3. Haz clic derecho sobre el archivo y selecciona **Open with Live Server**.

---

## 📌 Flujo General de la Aplicación

```text
┌─────────────────────┐
│     🎬 Cartelera    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│Seleccionar película │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Seleccionar función │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Seleccionar sala   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Elegir asientos   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Datos del comprador │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Confirmar reserva  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  🧾 Ticket digital  │
└─────────────────────┘
```

---

## 🎨 Diseño e Interfaz

* 🌑 **Dark Mode:** Interfaz oscura para generar una experiencia cinematográfica y facilitar la visualización.
* 💡 **Efectos Neón:** Iluminación para destacar elementos interactivos como botones, películas seleccionadas, asientos y tarjetas.
* ✨ **Microinteracciones:** Transiciones y animaciones para mejorar la experiencia del usuario y proporcionar una interfaz dinámica.
* 📱 **Diseño Responsive:** Adaptado para computadores, portátiles, tablets y smartphones.

---

## 📂 Base de Datos y API Local

El archivo `db.json` contiene la información utilizada por la aplicación:
* 🎬 Películas
* 🏢 Salas
* 🎟️ Funciones
* 💺 Asientos
* 🧾 Reservas

### Endpoints Disponibles
```http
GET    /peliculas
GET    /salas
GET    /funciones
GET    /reservas
POST   /reservas
PUT    /reservas/:id
DELETE /reservas/:id
```

---

## 📋 Resumen de Comandos de Ejecución

En una terminal ejecuta:
```bash
# 1. Instalar dependencias
npm install

# 2. Arrancar la API local
npx json-server --watch db.json --port 3000
```
*Finalmente, abre `index.html` utilizando la extensión Live Server.*

---

## 👨‍💻 Autor
Samuel Florez Gomez.

---

