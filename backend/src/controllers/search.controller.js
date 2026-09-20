const pool = require('../config/db');

const globalSearch = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const query = req.query.q || '';
    
    if (query.length < 2) {
      return res.status(200).json({ projects: [], builds: [] });
    }

    const searchQuery = `%${query}%`;
    const numericQuery = !isNaN(query) ? parseInt(query, 10) : null;

    // Search Projects
    // Match by name or description
    // Must be owner or member
    const projectsResult = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.description
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE (p.user_id = $1 OR pm.user_id = $1)
       AND p.name ILIKE $2
       LIMIT 5`,
      [userId, searchQuery]
    );

    // Search Builds
    // Match by build_number (exact) or branch name
    // Must have access to the project
    const buildsResult = await pool.query(
      `SELECT DISTINCT b.id, b.build_number, b.branch, b.status, b.platform, p.name as project_name, w.name as workflow_name
       FROM builds b
       JOIN projects p ON p.id = b.project_id
       LEFT JOIN workflows w ON w.id = b.workflow_id
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE (p.user_id = $1 OR pm.user_id = $1)
       AND (b.branch ILIKE $2 OR ($3::int IS NOT NULL AND b.build_number = $3))
       ORDER BY b.build_number DESC
       LIMIT 5`,
      [userId, searchQuery, numericQuery]
    );

    return res.status(200).json({
      success: true,
      projects: projectsResult.rows,
      builds: buildsResult.rows
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  globalSearch
};
