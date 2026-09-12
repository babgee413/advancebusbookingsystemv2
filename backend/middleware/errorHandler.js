function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body'
    });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'This record already exists.'
    });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      success: false,
      message: 'The requested record was not found.'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Something went wrong. Please try again later.'
  });
}

module.exports = errorHandler;
