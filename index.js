const express = require('express');
const morgan = require("morgan");
const cors = require("cors");
const errorhandler = require('errorhandler');

const config = require("./config")
const dbConnection = require("./models").dbConnection;

var isProduction = config.stage == "production";

const app = express();

const allowedOrigins = [
  'https://localhost',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permette anche richieste senza Origin (tipo Postman o server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'DNT', 'User-Agent', 'X-Requested-With', 'If-Modified-Since',
    'Cache-Control', 'Content-Type', 'Range', 'Authorization'
  ],
  credentials: true
}));

// Gestione preflight
app.options('{*path}', cors());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('combined'));
app.disable('etag');

dbConnection.sequelize.authenticate()
.then(() => {
  console.log("Connection has been established successfully.")
  dbConnection.sequelize.sync({ force: false }).then(() => {
    console.log("Synced db without drop.");
  });
})
.catch(err => {
  console.error("Unable to connect to the database:", err)
});

if (!isProduction) {
  app.use("/api",require('./routes'));
}else{
  app.use(require('./routes'));
}
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

if (!isProduction) {
  app.use(errorhandler())
}

/// error handlers
app.use(function(err, req, res, next) {
  res.status(err.status || 500).json(
    {
      "error":{
        message: err.message
      }
    });
});

app.listen(config.port, () => {
  console.log('AAS Studio API started on port: ' + config.port + ' with the following stage: ' + config.stage);
});
