const { listAlerts, createAlert, getStats } = require('../services/alertsService');

async function getAlerts(_req, res, next) {
  try {
    const data = await listAlerts();
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

async function postAlert(req, res, next) {
  try {
    const { title, neighborhood, severity, status } = req.body;
    if (!title || !neighborhood || !severity || !status) {
      return res.status(400).json({ message: 'Campos obrigatórios: title, neighborhood, severity e status.' });
    }

    const data = await createAlert(req.body);
    return res.status(201).json({ data });
  } catch (error) {
    return next(error);
  }
}

async function stats(_req, res, next) {
  try {
    const data = await getStats();
    res.json(data);
  } catch (error) {
    next(error);
  }
}

module.exports = { getAlerts, postAlert, stats };
