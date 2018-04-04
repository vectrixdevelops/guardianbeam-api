// Guardian Beam v1

var express    = require('express'),
    jwt        = require('jsonwebtoken'),
    moment     = require('moment'),
    passport   = require('passport'),
    bodyParser = require('body-parser'),
    Sequelize  = require('sequelize'),
    SlackStrategy = require('passport-slack').Strategy,
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
  client_id: { type: Sequelize.STRING, allowNull: false, primaryKey: true },
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

var client_id     = '',
    client_secret = '',
    scope         = 'users.identity',
    redirect_uri  = '',
    state         = '',
    team          = '';

passport.use(new SlackStrategy({
  clientID: client_id,
  clientSecret: client_secret
}, (accessToken, refreshToken, profile, done) => {
  done(null, profile);
}));

passport.use(new BearerStrategy(function (token, cb) {
  jwt.verify(token, 'secret', function (err, decoded) {
    if (err) return cb(err);

    database.query(
      'SELECT * FROM player WHERE client_id = ?',
      { raw: true, replacements: [ decoded.id ] }
    ).then(players => {
      return cb(null, players[0] ? players[0] : false);
    }).catch(err => {
      return cb(null, false);
    });
  });
}));

// # ----------------------------------- #
//              HTTP SERVER
// # ----------------------------------- #

var secret = 'sOmE SeCrEt'

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(passport.initialize());

app.get('/logout', function (req, res, next) {
  // Passport
});

// # ----------------------------------- #
//           SLACK INTEGRATION
// # ----------------------------------- #

app.post('/auth/slack', passport.authorize('slack'));

app.post('/auth/slack/callback',
  passport.authorize('slack', { failureRedirect: '/login' }),
  (req, res) => {
    return res.json({ token: jwt.sign({ id: req.client_id }, secret) });
  }
);
