let currentTrip = null;
let seatsData = [];
let selectedSeat = null;

async function loadTripAndSeats() {
  const params = new URLSearchParams(window.location.search);
  const tripId = params.get('trip_id');

  if (!tripId) {
    showAlert('No trip selected. Please select a trip first.', 'warning');
    setTimeout(() => window.location.href = '/trips', 2000);
    return;
  }

  try {
    const response = await apiRequest(`/trips/${tripId}/seats`);
    currentTrip = response.data.trip;
    seatsData = response.data.seats;
    
    renderTripInfo();
    renderSeats();
  } catch (error) {
    showAlert('Failed to load trip details: ' + error.message, 'danger');
  }
}

function renderTripInfo() {
  const container = document.getElementById('trip-info');
  if (!container || !currentTrip) return;

  const available = seatsData.filter(s => s.status === 'available').length;
  const booked = seatsData.filter(s => s.status === 'booked').length;

  container.innerHTML = `
    <div class="trip-info-summary">
      <div>
        <strong>${currentTrip.route}</strong><br>
        <small>${formatDate(currentTrip.departure_time)} at ${formatTime(currentTrip.departure_time)}</small>
      </div>
      <div>
        <span class="badge badge-success">${available} available</span>
        <span class="badge badge-danger">${booked} booked</span>
      </div>
    </div>
  `;
}

function renderSeats() {
  const container = document.getElementById('seats-container');
  if (!container) return;

  const capacity = currentTrip.capacity;
  const cols = 4;
  const rows = Math.ceil(capacity / cols);

  let html = '<div class="bus-layout">';
  html += '<div class="bus-front">🚌 FRONT (Driver)</div>';
  html += '<div class="seats-container">';

  let seatIndex = 0;
  for (let row = 0; row < rows; row++) {
    html += '<div class="seat-row">';
    
    for (let col = 0; col < cols; col++) {
      if (col === 2) {
        html += '<div class="seat-aisle"></div>';
      }
      
      if (seatIndex < capacity) {
        const seat = seatsData[seatIndex];
        const statusClass = seat.status === 'booked' ? 'booked' : '';
        const seatNum = seat.seat_number;
        
        html += `<div class="seat ${statusClass}" data-seat-id="${seat.seat_id}" data-seat-num="${seatNum}" onclick="selectSeat(this, ${seat.seat_id}, ${seatNum})">${String(seatNum).padStart(2, '0')}</div>`;
        seatIndex++;
      }
    }
    
    html += '</div>';
  }

  html += '</div>';
  html += `
    <div class="seat-legend">
      <div class="legend-item">
        <div class="legend-box available"></div>
        <span>Available</span>
      </div>
      <div class="legend-item">
        <div class="legend-box selected"></div>
        <span>Selected</span>
      </div>
      <div class="legend-item">
        <div class="legend-box booked"></div>
        <span>Booked</span>
      </div>
    </div>
  `;
  html += '</div>';

  container.innerHTML = html;
}

function selectSeat(element, seatId, seatNum) {
  if (element.classList.contains('booked')) {
    showAlert('This seat is already booked.', 'warning');
    return;
  }

  document.querySelectorAll('.seat.selected').forEach(s => {
    s.classList.remove('selected');
    s.classList.add('available');
  });

  element.classList.remove('available');
  element.classList.add('selected');
  selectedSeat = { seatId, seatNum };

  const confirmSection = document.getElementById('confirm-section');
  if (confirmSection) {
    confirmSection.innerHTML = `
      <div class="card" style="max-width:500px;margin:1.5rem auto;">
        <div class="card-body" style="text-align:center;">
          <h3>Seat #${String(seatNum).padStart(2, '0')} Selected</h3>
          <p style="color:var(--text-muted);margin-bottom:1rem;">Route: ${currentTrip.route}</p>
          <p style="color:var(--text-muted);margin-bottom:1.5rem;">${formatDate(currentTrip.departure_time)} at ${formatTime(currentTrip.departure_time)}</p>
          <button class="btn btn-success btn-block" onclick="confirmBooking()">Confirm Reservation</button>
        </div>
      </div>
    `;
  }
}

async function confirmBooking() {
  if (!selectedSeat) {
    showAlert('Please select a seat first.', 'warning');
    return;
  }

  try {
    const response = await apiRequest('/bookings', {
      method: 'POST',
      body: JSON.stringify({ seat_id: selectedSeat.seatId })
    });

    showConfirmation(response.data);
  } catch (error) {
    showAlert('Booking failed: ' + error.message, 'danger');
  }
}

function showConfirmation(booking) {
  const container = document.getElementById('booking-page');
  if (!container) return;

  container.innerHTML = `
    <div class="confirmation-card">
      <div class="confirmation-header">
        <div class="check-icon">✓</div>
        <h2 style="color:#fff;margin-bottom:0.25rem;">Booking Confirmed!</h2>
        <p style="opacity:0.9;">Your seat has been successfully reserved</p>
      </div>
      <div class="confirmation-body">
        <div class="booking-detail-row">
          <span class="label">Booking ID</span>
          <span class="value">#${booking.booking_id}</span>
        </div>
        <div class="booking-detail-row">
          <span class="label">Route</span>
          <span class="value">${booking.route}</span>
        </div>
        <div class="booking-detail-row">
          <span class="label">Departure</span>
          <span class="value">${formatDateTime(booking.departure_time)}</span>
        </div>
        <div class="booking-detail-row">
          <span class="label">Seat Number</span>
          <span class="value">${String(booking.seat_number).padStart(2, '0')}</span>
        </div>
        <div class="booking-detail-row">
          <span class="label">Status</span>
          <span class="value"><span class="badge badge-success">${booking.status}</span></span>
        </div>
        <div style="margin-top:1.5rem;display:flex;gap:0.75rem;">
          <a href="/bookings" class="btn btn-primary" style="flex:1;">View My Bookings</a>
          <a href="/trips" class="btn btn-outline" style="flex:1;">Book Another</a>
        </div>
      </div>
    </div>
  `;
}
