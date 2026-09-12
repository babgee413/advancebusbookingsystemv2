let allBookings = [];
let allTrips = [];

async function loadAdminStats() {
  try {
    const response = await apiRequest('/bookings/stats');
    const stats = response.data;
    
    document.getElementById('stat-trips').textContent = stats.total_trips;
    document.getElementById('stat-bookings').textContent = stats.total_bookings;
    document.getElementById('stat-available').textContent = stats.available_seats;
    document.getElementById('stat-booked').textContent = stats.booked_seats;

    renderRecentBookings(stats.recent_bookings);
  } catch (error) {
    showAlert('Failed to load statistics: ' + error.message, 'danger');
  }
}

function renderRecentBookings(bookings) {
  const container = document.getElementById('recent-bookings');
  if (!container) return;

  if (bookings.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">No recent bookings</p>';
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Route</th>
            <th>Seat</th>
            <th>Departure</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map(b => `
            <tr>
              <td>${b.full_name}</td>
              <td>${b.route}</td>
              <td>#${String(b.seat_number).padStart(2, '0')}</td>
              <td>${formatDateTime(b.departure_time)}</td>
              <td>${formatDateTime(b.booking_time)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function loadAdminTrips() {
  try {
    const response = await apiRequest('/trips');
    allTrips = response.data;
    renderAdminTrips(allTrips);
  } catch (error) {
    showAlert('Failed to load trips: ' + error.message, 'danger');
  }
}

function renderAdminTrips(trips) {
  const container = document.getElementById('admin-trips-container');
  if (!container) return;

  if (trips.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🚌</div>
        <h3>No trips found</h3>
        <p>Create a new trip to get started.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Trip ID</th>
            <th>Route</th>
            <th>Departure</th>
            <th>Capacity</th>
            <th>Available</th>
            <th>Booked</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${trips.map(t => `
            <tr>
              <td>#${t.trip_id}</td>
              <td>${t.route}</td>
              <td>${formatDateTime(t.departure_time)}</td>
              <td>${t.capacity}</td>
              <td><span class="badge badge-success">${t.available_seats}</span></td>
              <td><span class="badge badge-danger">${t.booked_seats}</span></td>
              <td>
                <button class="btn btn-outline btn-sm" onclick="editTrip(${t.trip_id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteTrip(${t.trip_id})">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function showCreateTripModal() {
  document.getElementById('modal-title').textContent = 'Create New Trip';
  document.getElementById('trip-form').reset();
  document.getElementById('trip-id-field').value = '';
  document.getElementById('trip-modal').classList.add('active');
}

function editTrip(tripId) {
  const trip = allTrips.find(t => t.trip_id === tripId);
  if (!trip) return;

  document.getElementById('modal-title').textContent = 'Edit Trip';
  document.getElementById('trip-id-field').value = trip.trip_id;
  document.getElementById('trip-route').value = trip.route;
  
  const dt = new Date(trip.departure_time);
  const localDt = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('trip-departure').value = localDt;
  document.getElementById('trip-capacity').value = trip.capacity;
  
  document.getElementById('trip-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('trip-modal').classList.remove('active');
}

async function saveTrip(event) {
  event.preventDefault();

  const tripId = document.getElementById('trip-id-field').value;
  const route = document.getElementById('trip-route').value;
  const departure_time = document.getElementById('trip-departure').value;
  const capacity = parseInt(document.getElementById('trip-capacity').value);

  if (!route || !departure_time || !capacity) {
    showAlert('All fields are required', 'danger');
    return;
  }

  try {
    if (tripId) {
      await apiRequest(`/trips/${tripId}`, {
        method: 'PUT',
        body: JSON.stringify({ route, departure_time, capacity })
      });
      showAlert('Trip updated successfully', 'success');
    } else {
      await apiRequest('/trips', {
        method: 'POST',
        body: JSON.stringify({ route, departure_time, capacity })
      });
      showAlert('Trip created successfully', 'success');
    }
    
    closeModal();
    loadAdminTrips();
  } catch (error) {
    showAlert('Failed to save trip: ' + error.message, 'danger');
  }
}

async function deleteTrip(tripId) {
  if (!confirm('Are you sure you want to delete this trip?')) return;

  try {
    await apiRequest(`/trips/${tripId}`, { method: 'DELETE' });
    showAlert('Trip deleted successfully', 'success');
    loadAdminTrips();
  } catch (error) {
    showAlert('Failed to delete trip: ' + error.message, 'danger');
  }
}

async function loadAdminBookings() {
  try {
    const response = await apiRequest('/bookings');
    allBookings = response.data;
    renderAdminBookings(allBookings);
  } catch (error) {
    showAlert('Failed to load bookings: ' + error.message, 'danger');
  }
}

function renderAdminBookings(bookings) {
  const container = document.getElementById('admin-bookings-container');
  if (!container) return;

  if (bookings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <h3>No bookings found</h3>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Booking ID</th>
            <th>Student</th>
            <th>Email</th>
            <th>Route</th>
            <th>Seat</th>
            <th>Departure</th>
            <th>Booked On</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map(b => `
            <tr>
              <td>#${b.booking_id}</td>
              <td>${b.full_name}</td>
              <td>${b.email}</td>
              <td>${b.route}</td>
              <td>#${String(b.seat_number).padStart(2, '0')}</td>
              <td>${formatDateTime(b.departure_time)}</td>
              <td>${formatDateTime(b.booking_time)}</td>
              <td><span class="badge badge-${b.status === 'confirmed' ? 'success' : 'danger'}">${b.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
