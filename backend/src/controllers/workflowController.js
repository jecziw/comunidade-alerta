const { pool } = require('../db');
const { emitToTenant } = require('../services/socketService');
const { sendEmail } = require('../services/emailService');
const env = require('../config/env');

const TRANSITIONS = { open:['progress','cancelled'], progress:['resolved','open','cancelled'], resolved:['open'], cancelled:[] };

exports.updateStatus = async (req, res) => {
  const { id } = req.params; const { status, note } = req.body;
  const { rows:[cur] } = await pool.query('SELECT * FROM alerts WHERE id=$1 AND tenant_id=$2',[id,req.tenant.id]);
  if (!cur) return res.status(404).json({ error: 'Alerta não encontrado.' });
  if (!TRANSITIONS[cur.status]?.includes(status))
    return res.status(400).json({ error: `Transição inválida: ${cur.status} → ${status}` });
  const { rows:[updated] } = await pool.query(
    `UPDATE alerts SET status=$1,resolution_notes=COALESCE($2,resolution_notes),
       resolved_at=CASE WHEN $1='resolved' THEN NOW() ELSE NULL END WHERE id=$3 RETURNING *`,
    [status,note,id]
  );
  await pool.query(
    'INSERT INTO alert_history(alert_id,user_id,action,old_status,new_status,note) VALUES($1,$2,$3,$4,$5,$6)',
    [id,req.user.id,'status_change',cur.status,status,note]
  );
  emitToTenant(req.tenant.id,'alert:updated',updated);
  if (status==='resolved' && cur.created_by) {
    const { rows:[creator] } = await pool.query('SELECT name,email FROM users WHERE id=$1',[cur.created_by]);
    if (creator) sendEmail({to:creator.email,subject:'Alerta resolvido',
      html:`<p>Olá ${creator.name}, o alerta "${cur.description.substring(0,60)}" foi resolvido.${note?`<br>Notas: ${note}`:''}</p>`}).catch(()=>{});
  }
  res.json({ alert:updated });
};

exports.assignAlert = async (req, res) => {
  const { id } = req.params; const { userId } = req.body;
  const { rows:[user] } = await pool.query('SELECT id,name FROM users WHERE id=$1 AND tenant_id=$2',[userId,req.tenant.id]);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const { rows:[alert] } = await pool.query(
    'UPDATE alerts SET assigned_to=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *',[userId,id,req.tenant.id]
  );
  if (!alert) return res.status(404).json({ error: 'Alerta não encontrado.' });
  await pool.query('INSERT INTO alert_history(alert_id,user_id,action,note) VALUES($1,$2,$3,$4)',
    [id,req.user.id,'assigned',`Atribuído a ${user.name}`]);
  emitToTenant(req.tenant.id,'alert:assigned',{alertId:id,assignedTo:user});
  res.json({ alert });
};

exports.getHistory = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT h.*,u.name AS user_name FROM alert_history h LEFT JOIN users u ON u.id=h.user_id
     WHERE h.alert_id=$1 ORDER BY h.created_at ASC`,[req.params.id]
  );
  res.json({ history:rows });
};
