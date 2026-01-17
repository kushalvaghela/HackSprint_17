const dotenv = require('dotenv');
dotenv.config({ path: './.env' });
require('./app.js');
const requestRoutes = require('./routes/request.routes');
