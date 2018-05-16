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

var setUser = ({ user_id, active, active_server }) => {
  return User.findOrCreate({ where: { id: user_id }, defaults: {
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
  });
};

var addTicket = ({ target_id, issuer_id, type, priority, target_server }) => {
  return Ticket.findOrCreate({ where: { target_id: target_id, type: type, createdAt: { [Op.lt]: new Date(new Date() - 0.5 * 60 * 60 * 1000) } }, defaults: {
      priority: priority,
      target_server: target_server
    }
  }).spread((ticket, created) => {
    if (created) {
      setUser({ user_id: target_id, active: true, active_server: target_server });

      User.findOne({ where: { id: target_id } }).then(user => {
        ticket.setTargetUser(user);
      })
    }

    setUser({ user_id: issuer_id, active: true, })

    User.findOne({ where: { id: issuer_id } }).then(user => {
      ticket.addTicketSource(user);
    })
  });
};

var addLabel = ({ ticket_id, tag_id, name, priority, reason }) => {
  return Label.findOrCreate({ where: { tag_id: tag_id  }, defaults: {
      name: name,
      priority: priority
    }
  }).spread((label, created) => {
    return Ticket.findOne({ where: { ticket_id: ticket_id } }).then(ticket => {
      ticket.addLabel(label, { through: { reason: reason }});
    })
  });
};

// GETTERS

var getUser = ({ target_id }) => {
  return User.findOne({ where: { id: issuer_id } });
};

var getUserTickets = (index, amount, { target_id, type, start_date, end_date }) => {
  getUser({ target_id: target_id }).then(user => {
    return user.getTicketTargets({ where: {
        type: type,
        createdAt: {
          [Op.lt]: new Date(end_date),
          [Op.gt]: new Date(start_date)
        }
      },
      offset: index,
      limit: amount
    })
  })
};


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

app.post('/user/update', (req, res) => {
  setUser({
    user_id: req.params.user_id,
    active: req.params.active,
    active_server: req.params.active_server
  }).then(() => {
    res.json({
      status: 'ok'
    })
  }).catch(() => {
    res.json({
      status: 'error'
    })
  })
});

app.post('/report/create', (req, res) => {
  addTicket({
    target_id: req.params.target_id,
    issuer_id: req.params.issuer_id,
    type: req.params.type,
    priority: req.params.priority,
    target_server: req.params.
  }).then(() => {
    res.json({
      status: 'ok'
    })
  }).catch(() => {
    status: 'error'
  })
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
