const { pool } = require('../db');
const { emitToTenant } = require('../services/socketService');
const { dispatchWebhook } = require('../services/webhookService');
const { notifyTenantUsers } = require('../services/pushService');

exports.list = async (req, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
  const { status, type, source } = req.query;
  const page  = Math.max(parseInt(req.query.page)  || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  const params = [tenantId]; let where = 'WHERE a.tenant_id=$1';
  if (status) { params.push(status); where+=` AND a.status=$${params.length}`; }
  if (type)   { params.push(type);   where+=` AND a.type=$${params.length}`; }
  if (source) { params.push(source); where+=` AND a.source=$${params.length}`; }
  const off = (page-1)*limit;
  const { rows } = await pool.query(
    `SELECT a.*,u.name AS assigned_name FROM alerts a LEFT JOIN users u ON u.id=a.assigned_to
     ${where} ORDER BY a.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params,limit,off]
  );
  const { rows:[{count}] } = await pool.query(`SELECT COUNT(*) FROM alerts a ${where}`,params);
  res.json({ alerts:rows, total:parseInt(count), page, limit });
};

exports.create = async (req, res) => {
  const { type, description, location, latitude, longitude, severity='medium' } = req.body;
  if (!type||!description) return res.status(400).json({ error: 'type e description obrigatórios.' });
  const { rows:[alert] } = await pool.query(
    `INSERT INTO alerts(tenant_id,type,description,location,latitude,longitude,severity,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.tenant.id,type,description,location,latitude,longitude,severity,req.user.id]
  );
  emitToTenant(req.tenant.id,'alert:new',alert);
  dispatchWebhook(req.tenant.id,'alert.created',alert).catch(()=>{});
  if(['high','critical'].includes(severity))
    notifyTenantUsers(req.tenant.id,{title:`Novo alerta: ${type}`,body:description.substring(0,100),data:{alertId:alert.id}}).catch(()=>{});
  res.status(201).json({ alert });
};
