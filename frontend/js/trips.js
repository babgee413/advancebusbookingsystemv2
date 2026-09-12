let tripsData = [];

async function loadTrips() {
  try {
    const response = await apiRequest('/trips');
    tripsData = response.data;
    renderTrips(tripsData);
  } catch (error) {
    showAlert('Failed to load trips: ' + error.message, 'danger');
  }
}

function renderTrips(trips) {
  const container = document.getElementById('trips-container');
  if (!container) return;

  if (trips.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🚌</div>
        <h3>No trips available</h3>
        <p>Check back later for available shuttle trips.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = trips.map(trip => `
    <div class="trip-card">
      <div class="trip-card-header">
        <span class="route">${trip.route}</span>
        <span class="badge">Trip #${trip.trip_id}</span>
      </div>
      <div class="trip-card-body">
        <div class="trip-detail">
          <span class="icon">📅</span>
          <span>${formatDate(trip.departure_time)}</span>
        </div>
        <div class="trip-detail">
          <span class="icon">🕐</span>
          <span>${formatTime(trip.departure_time)}</span>
        </div>
        <div class="trip-detail">
          <span class="icon">💺</span>
          <span>Capacity: ${trip.capacity} seats</span>
        </div>
        <div class="trip-seats">
          <div class="seat-stat available">
            <span class="count">${trip.available_seats}</span>
            <span class="label">Available</span>
          </div>
          <div class="seat-stat booked">
            <span class="count">${trip.booked_seats}</span>
            <span class="label">Booked</span>
          </div>
        </div>
        <a href="/booking?trip_id=${trip.trip_id}" class="btn btn-primary btn-block">Select Seats</a>
      </div>
    </div>
  `).join('');
}

function filterTrips(route) {
  if (!route || route === 'all') {
    renderTrips(tripsData);
  } else {
    const filtered = tripsData.filter(t => t.route.toLowerCase().includes(route.toLowerCase()));
    renderTrips(filtered);
  }
}
