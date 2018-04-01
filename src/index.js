// Guardian Beam v1

var express    = require('express'),
    jwt        = require('jsonwebtoken'),
    moment     = require('moment'),
    axios      = require('axios'),
    passport   = require('passport'),
    bodyParser = require('body-parser'),
    Sequelize  = require('sequelize'),
    LocalStrategy = require('passport-local').Strategy,
    BearerStrategy = require('passport-http-bearer').Strategy;

// # ----------------------------------- #
//              DATABASE
// # ----------------------------------- #

var database = new Sequelize('beam',
   process.env.DATABASE_USERNAME,
   process.env.DATABASE_PASSWORD, {
     host: 'localhost',
     dialect: 'postgres',

     pool: {
       max: 5,
       min: 0,
       acquire: 30000,
       idle: 10000
     },

     operatorsAliases: false
   });

database
  .authenticate()
  .then(() => {
    console.log('database: connection established');
  })
  .catch(err => {
    console.error('database: connection failed', err)
  });

var Player = database.define('player', {
  user_id: { type: Sequelize.UUID, allowNull: false },
  active: { type: Sequelize.BOOLEAN, allowNull: false },
  active_server: { type: Sequelize.STRING, allowNull: false }
});

var Report = database.define('report', {
  type: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
  createdAt: { Sequelize.DATE, allowNull: false, primaryKey: true },
  priority: { type: Sequelize.INTEGER, allowNull: false },
  source_server: { type: Sequelize.STRING, allowNull: false },
  target_server: { type: Sequelize.STRING, allowNull: false }
});

var ReportTag = database.define('report_tag', {
  reason: { type: Sequelize.STRING, allowNull: true }
});

var Tag = database.define('tag', {
  name: { type: Sequelize.STRING, allowNull: false },
  priority: { type: Sequelize.INTEGER, allowNull: false }
});

Player.hasMany(Report, { as: 'TargetedReports', foreignKey: 'target_id' });
Player.hasMany(Report, { as: 'IssuedReports', foreignKey: 'issuer_id' });

Report.belongsTo(Player, { as: 'TargetPlayer', foreignKey: 'target_id', primaryKey: true });
Report.belongsTo(Player, { as: 'SourcePlayer', foreignKey: 'issuer_id', primaryKey: true });
Report.belongsTo(ReportTag, { as: 'ReportTag' });

ReportTag.hasMany(Report, { as: 'Reports' });
ReportTag.hasMany(Tag, { as: 'Tags' });

Tag.belongsTo(ReportTag, { as: 'ReportTag' });

// # ----------------------------------- #
//             AUTH STRATEGY
// # ----------------------------------- #

passport.use(new LocalStrategy(function (token, cb) {
  // Verify user here.
}));

passport.use(new BearerStrategy(function (token, cb) {
  jwt.verify(token, 'secret', function (err, decoded) {
    if (err) return cb(err);
    // indentify user
    cb(null, true);
  });
}));

// # ----------------------------------- #
//              HTTP SERVER
// # ----------------------------------- #

var client_id     = '',
    client_secret = '',
    scope         = 'users.identity',
    redirect_uri  = '',
    state         = '',
    team          = '';

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(passport.initialize());

app.post('/slack/authorize', function (req, res, next) {
  res.status(301).redirect('https://slack.com/oauth/authorize?client_id=' + client_id + '&scope=' + scope + '&redirect_uri=' + redirect_uri + '&state=' + state + '&team=' + team);
});

app.post('/slack/oauth', function (req, res, next) {
  if (req.body.state !== state) res.status(401).send('Incorrect state recieved. (401)');

  if (res.body.code != null) {
    axios.get('https://slack.com/api/oauth.access?client_id=' + client_id + '&client_secret=' + client_secret + '&code=' + req.body.code)
      .then(function (response) {
        axios.post('https://slack.com/api/auth.test?access_token=' + response.body.access_token + '')
      })
      .catch(function (error) {

      });
  }
});

app.get('/logout', function (req, res, next) {
  // Passport
});

// # ----------------------------------- #
//           SLACK INTEGRATION
// # ----------------------------------- #
