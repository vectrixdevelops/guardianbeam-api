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

var User = database.define('user', {
  id: { type: Sequelize.STRING, allowNull: false, primaryKey: true },
  active: { type: Sequelize.BOOLEAN, allowNull: false },
  active_server: { type: Sequelize.STRING, allowNull: false }
});

var Ticket = database.define('ticket', {
  id: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
  type: { type: Sequelize.INTEGER, allowNull: false },
  createdAt: { type: Sequelize.DATE, allowNull: false },
  priority: { type: Sequelize.INTEGER, allowNull: false },
  target_server: { type: Sequelize.STRING, allowNull: false }
});

var TicketLabels = database.define('ticket_labels', {
  reason: { type: Sequelize.STRING, allowNull: true }
});

var Label = database.define('label', {
  tag_id: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
  name: { type: Sequelize.STRING, allowNull: false, primaryKey:  },
  priority: { type: Sequelize.INTEGER, allowNull: false }
});

User.belongsToMany(Ticket, { as: 'IssuedTicket', through: 'user_tickets', foreignKey: 'source_id' })
Ticket.belongsToMany(User, { as: 'TicketSource', through: 'user_tickets', foreignKey: 'ticket_id' })

User.belongsToMany(Ticket, { as: 'TicketTarget', foreignKey: 'target_id' })
Ticket.hasOne(User, { as: 'TargetUser', foreignKey: 'target_id' })

Label.belongsToMany(Ticket, { as: 'Ticket', through: 'ticket_labels', foreignKey: 'tag_id' })
Ticket.belongsToMany(Labels, { as: 'Label', through: 'ticket_labels', foreignKey: 'ticket_id' })

// # ----------------------------------- #
//             AUTH STRATEGY
// # ----------------------------------- #

var client_id     = process.env.CLIENT_ID,
    client_secret = process.env.CLIENT_SECRET,
    scope         = 'users.identity',
    team          = process.env.TEAM_ID;

passport.use(new SlackStrategy({
  clientID: client_id,
  clientSecret: client_secret
}, (accessToken, refreshToken, profile, done) => {
  done(null, profile);
}));

passport.use(new BearerStrategy(function (token, cb) {
  jwt.verify(token, 'secret', function (err, decoded) {
    if (err) return cb(err);

    Player.findAll({
      where: {
        id: decoded.id
      }
    }).then(players => {
      return cb(null, players[0] ? players[0] : false);
    }).catch(err => {
      return cb(null, false);
    });
  });
}));

// # ----------------------------------- #
//             CORE FUNCTIONS
// # ----------------------------------- #

var setPlayer = ({ user_id, active, active_server }) => {
  User.findOrCreate({ where: { id: user_id }, defaults: {
      active: active,
      active_server: active_server
    }
  }).spread((user, created) => {
    if (created) return;
    return user.update({
      active: active,
      active_server: active_server
    })
  }).catch(err => {
    console.error(err);
  })
}

var addTicket = ({ target_id, issuer_id, type, priority, source_server, target_server }) => {
  Ticket.findOrCreate({ where: { target_id: target_id, type: type, createdAt: { [Op.lt]: new Date(new Date() - 0.5 * 60 * 60 * 1000) } }, defaults: {
      createdAt: new Date(),
      priority: priority,
      source_server: source_server,
      target_server: target_server
    }
  }).spread((ticket, created) => {
    // Set Player (In case they dont exist)
    if (created) {
      setPlayer({ user_id: target_id, active: true, active_server: target_server });

      User.findOne({ where: { id: target_id } }).then(user => {
        ticket.setTargetUser(user);
      })
    }

    setPlayer({ user_id: issuer_id, active: true, })

    User.findOne({ where: { id: issuer_id } }).then(user => {
      ticket.addTicketSource(user);
    })
  })
}

var addTicketLabel = ({ target_id, issuer_id, type, tag_id }) => {

}


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
    return res.json({ token: jwt.sign({ id: req.id, displayName: req.displayName }, secret) });
  }
);

app.all('*', (req, res, next) => {
  passport.authenticate('bearer', (err, user, info) => {
    if (err) return next(err);
    if (user) {
      req.id = user.id;
      return next();
    } else {
      return res.status(401).json({ status: 'error', code: 'unauthorized' });
    }
  })(req, res, next);
});

// # ----------------------------------- #
//              EXPRESS APP
// # ----------------------------------- #

app.post('/report/create', (req, res) => {
  const type = req.params.type,
        issuer = req.params.issuer,
        reported = req.params.reported,
        beforeDate = req.params.beforeDate,
        afterDate = req.params.afterDate,
        targetServer = req.params.targetServer;




  return res.json({

  });
})

app.get('/report/list', (req, res) => {
  const type = req.params.type,
        issuer = req.params.issuer,
        reported = req.params.reported,
        beforeDate = req.params.beforeDate,
        afterDate = req.params.afterDate,
        targetServer = req.params.targetServer;



  return res.json({
    status: 'ok'
  });
});
