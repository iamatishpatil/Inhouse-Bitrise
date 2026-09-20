// src/controllers/runner.controller.js
const pool = require('../config/db');

const getRunnerStatus = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT last_heartbeat FROM runner_status WHERE id = 1');
    
    if (result.rows.length === 0) {
      return res.status(200).json({ 
        success: true, 
        up: false, 
        message: 'Runner never started',
        capacity: parseInt(process.env.RUNNER_CAPACITY || 4, 10)
      });
    }

    const lastHeartbeat = new Date(result.rows[0].last_heartbeat);
    const now = new Date();
    const diffSeconds = (now - lastHeartbeat) / 1000;

    // The runner emits a heartbeat every 10 seconds.
    // Allow a 30 second window to account for brief delays or small clock drifts.
    const isUp = diffSeconds <= 30;

    return res.status(200).json({
      success: true,
      up: isUp,
      lastHeartbeat: lastHeartbeat.toISOString(),
      capacity: parseInt(process.env.RUNNER_CAPACITY || 4)
    });
  } catch (error) {
    // 42P01 is PostgreSQL's error code for "undefined_table"
    if (error.code === '42P01') {
      return res.status(200).json({ 
        success: true, 
        up: false, 
        message: 'Runner table does not exist yet',
        capacity: parseInt(process.env.RUNNER_CAPACITY || 4, 10)
      });
    }
    next(error);
  }
};

module.exports = {
  getRunnerStatus
};
