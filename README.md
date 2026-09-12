# ATBU Bus Booking & Seat Reservation System

A web-based bus transport booking and seat reservation system for the **Abubakar Tafawa Balewa University (ATBU), Bauchi** inter-campus shuttle service operating between **Yelwa Campus** and **Gubi Campus**.

## Features

- **Student Registration & Login** - Secure JWT authentication
- **Trip Browsing** - View available shuttle trips with real-time seat availability
- **Seat Selection** - Interactive seat layout with visual availability indicators
- **Seat Reservation** - Book specific seats with double-booking prevention
- **Booking Confirmation** - Instant confirmation with booking details
- **My Bookings** - View and manage personal reservations
- **Admin Dashboard** - Statistics overview for administrators
- **Trip Management** - Create, edit, and delete trips (admin only)
- **Booking Management** - View all system bookings (admin only)

## Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Authentication:** JSON Web Tokens (JWT)

## Project Structure

```
atbu-bus-booking/
├── frontend/
│   ├── index.html          # Landing page
│   ├── login.html          # Login page
│   ├── register.html       # Registration page
│   ├── dashboard.html      # Student dashboard
│   ├── trips.html          # Available trips
│   ├── booking.html        # Seat selection & booking
│   ├── bookings.html       # My bookings
│   ├── admin/
│   │   ├── dashboard.html  # Admin dashboard
│   │   ├── trips.html      # Trip management
│   │   └── bookings.html   # Booking management
│   ├── css/
│   │   └── style.css       # Complete stylesheet
│   ├── js/
│   │   ├── auth.js         # Authentication utilities
│   │   ├── trips.js        # Trip listing logic
│   │   ├── booking.js      # Seat selection & booking
│   │   ├── bookings.js     # My bookings management
│   │   └── admin.js        # Admin functionality
│   └── images/
│       └── logo.svg        # ATBU Shuttle logo
├── backend/
│   ├── server.js           # Express server entry point
│   ├── config/
│   │   ├── config.js       # Configuration
│   │   └── database.js     # MySQL connection pool
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── tripController.js
│   │   └── bookingController.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── tripRoutes.js
│   │   └── bookingRoutes.js
│   ├── middleware/
│   │   ├── auth.js         # JWT authentication & role authorization
│   │   └── errorHandler.js # Error handling middleware
│   ├── database/
│   │   ├── migrate.js      # Database migration
│   │   ├── seed.js         # Seed data
│   │   └── reset.js        # Database reset
│   └── .env.example        # Environment variables template
├── package.json
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your MySQL credentials:

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=atbu_bus_booking
DB_USER=root
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key
```

### 3. Create MySQL Database

```sql
CREATE DATABASE atbu_bus_booking;
```

### 4. Run Migrations

```bash
npm run migrate
```

### 5. Seed Demo Data

```bash
npm run seed
```

### 6. Start the Server

```bash
npm start
```

The application will be available at: **http://localhost:3000**

## Demo Credentials

### Administrator
- **Email:** admin@atbu.edu.ng
- **Password:** admin123

### Student
- **Email:** abubakar@atbu.edu.ng
- **Password:** student123

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new student
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Get user profile (authenticated)

### Trips
- `GET /api/trips` - Get all available trips
- `GET /api/trips/:id` - Get trip by ID
- `GET /api/trips/:id/seats` - Get seats for a trip
- `POST /api/trips` - Create trip (admin only)
- `PUT /api/trips/:id` - Update trip (admin only)
- `DELETE /api/trips/:id` - Delete trip (admin only)

### Bookings
- `POST /api/bookings` - Create booking (authenticated)
- `GET /api/bookings/my` - Get my bookings (authenticated)
- `GET /api/bookings` - Get all bookings (admin only)
- `GET /api/bookings/:id` - Get booking by ID
- `PUT /api/bookings/:id/cancel` - Cancel booking
- `GET /api/bookings/stats` - Get booking statistics (admin only)

## Key Features

### Double-Booking Prevention
The system uses MySQL transactions with row-level locking (`SELECT ... FOR UPDATE`) to prevent two users from simultaneously booking the same seat. The database enforces uniqueness constraints to guarantee seat allocation integrity.

### Role-Based Access Control
- **Students:** Can view trips, select seats, make bookings, view own bookings
- **Administrators:** Can manage trips, view all bookings, view system statistics

### Responsive Design
The interface is fully responsive and works on desktop, laptop, tablet, and mobile devices.

## Database Schema

- **users** - Registered users (students and administrators)
- **trips** - Scheduled shuttle trips
- **seats** - Individual seats per trip
- **bookings** - Seat reservation records

## License

MIT
# advancebusbookingsystemv2
# advancebusbookingsystemv2
# advancebusbookingsystemv2
# advancebusbookingsystemv2
# advancebusbookingsystemv2 git init git add README.md git commit -m first commit git branch -M main git remote set-url origin git@github.com:babgee413/advancebusbookingsystemv2.git git push -u origin main
