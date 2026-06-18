const { pool } = require('../db');
exports.getStats = async (req, res) => {
  const tid = req.tenant.id;
  const [totals,byStatus,byType,bySource,trend] = await Promise.all([
    pool.query(`SELECT COUNT(*) total,COUNT(*) FILTER(WHERE status='open') open,COUNT(*) FILTER(WHERE status='resolved') resolved FROM alerts WHERE tenant_id=$1`,[tid]),
    pool.query('SELECT status,COUNT(*) count FROM alerts WHERE tenant_id=$1 GROUP BY status',[tid]),
    pool.query('SELECT type,COUNT(*) count FROM alerts WHERE tenant_id=$1 GROUP BY type ORDER BY count DESC',[tid]),
    pool.query('SELECT source,COUNT(*) count FROM alerts WHERE tenant_id=$1 GROUP BY source ORDER BY count DESC',[tid]),
    pool.query(`SELECT DATE(created_at) date,COUNT(*) count FROM alerts WHERE tenant_id=$1 AND created_at>=NOW()-INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY date`,[tid]),
  ]);
  res.json({ totals:totals.rows[0], byStatus:byStatus.rows, byType:byType.rows, bySource:bySource.rows, trend:trend.rows });
};
