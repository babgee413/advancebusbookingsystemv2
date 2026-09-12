async function loadMyBookings() {
  try {
    const response = await apiRequest('/bookings/my');
    renderBookings(response.data);
  } catch (error) {
    showAlert('Failed to load bookings: ' + error.message, 'danger');
  }
}

function renderBookings(bookings) {
  const container = document.getElementById('bookings-container');
  if (!container) return;

  if (bookings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <h3>No bookings yet</h3>
        <p>You haven't made any reservations yet.</p>
        <a href="/trips" class="btn btn-primary" style="margin-top:1rem;">Browse Trips</a>
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
            <th>Route</th>
            <th>Departure</th>
            <th>Seat</th>
            <th>Booked On</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map(b => `
            <tr>
              <td>#${b.booking_id}</td>
              <td>${b.route}</td>
              <td>${formatDateTime(b.departure_time)}</td>
              <td><strong>${String(b.seat_number).padStart(2, '0')}</strong></td>
              <td>${formatDateTime(b.booking_time)}</td>
              <td><span class="badge badge-${b.status === 'confirmed' ? 'success' : 'danger'}">${b.status}</span></td>
              <td>
                ${b.status === 'confirmed' ? `<button class="btn btn-danger btn-sm" onclick="cancelBooking(${b.booking_id})">Cancel</button>` : '-'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function cancelBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;

  try {
    await apiRequest(`/bookings/${bookingId}/cancel`, { method: 'PUT' });
    showAlert('Booking cancelled successfully', 'success');
    loadMyBookings();
  } catch (error) {
    showAlert('Failed to cancel booking: ' + error.message, 'danger');
  }
}
