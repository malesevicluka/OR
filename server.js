require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));

const port = 3000;


const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'NocniKlubovi',
    password: 'postgres',
    port: 5432,
});

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    })
);

passport.use(
    new Auth0Strategy(
        {
            domain: process.env.AUTH0_DOMAIN,
            clientID: process.env.AUTH0_CLIENT_ID,
            clientSecret: process.env.AUTH0_CLIENT_SECRET,
            callbackURL: process.env.AUTH0_CALLBACK_URL,
        },
        (accessToken, refreshToken, extraParams, profile, done) => {
            return done(null, profile);
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

app.use(passport.initialize());
app.use(passport.session());


const checkAuthentication = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dynamic-content', (req, res) => {
    const isAuthenticated = req.isAuthenticated();
    const dynamicContent = isAuthenticated
        ? '<a href="/profile">Korisnički profil</a><br><a href="/logout">Odjava</a>'
        : '<a href="/login">Prijava</a>';
    res.send(dynamicContent);
});

app.get('/login', passport.authenticate('auth0', {
    scope: 'openid email profile',
}));

app.get('/callback',
    passport.authenticate('auth0', {
        failureRedirect: '/',
    }),
    (req, res) => {
        res.redirect('/');
    }
);

app.get('/profile', checkAuthentication, (req, res) => {
    res.send(
        `<h1>Korisnički profil</h1>
         <pre>${JSON.stringify(req.user, null, 2)}</pre>
         <a href="/refresh-exports">Osvježi preslike</a><br>
         <a href="/logout">Odjava</a><br>
         <a href="/">Početna stranica</a>`
    );
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});


app.get('/refresh-exports', checkAuthentication, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM nightclubs");
        
        
        const csvData = convertToCSV(result.rows);
        fs.writeFileSync('public/klubovi.csv', csvData);
        
        
        const jsonData = {
            "@context": {
                "@vocab": "https://schema.org/",
                "ime": "name",
                "adresa": "address"
            },
            "@type": "NightClub",
            "nightclubs": result.rows
        };
        fs.writeFileSync('public/klubovi.json', JSON.stringify(jsonData, null, 2));
        
        res.send('Exports refreshed successfully! <br><a href="/">Back to home</a>');
    } catch (error) {
        console.error('Error refreshing exports:', error);
        res.status(500).send('Error refreshing exports');
    }
});


function convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    csvRows.push(headers.join(','));
    
    for (const row of data) {
        const values = headers.map(header => {
            const val = row[header];
            return `"${val}"`; 
        });
        csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
}


app.get('/api/clubs', async (req, res) => {
    try {
        const filter = req.query.filter || '';
        const attribute = req.query.attribute || 'Ime';

        let query = '';
        let values = [`%${filter}%`]; 

        
        if (attribute === 'all') {
            

            const filterValue1 = parseFloat(filter);
            if (isNaN(filterValue1)) {
                query = `
                    SELECT n.*, 
                        ARRAY_AGG(r."dan" || ': ' || r."otvaranje" || ' - ' || r."zatvaranje") AS "Radno_vrijeme"
                    FROM nightclubs n
                    LEFT JOIN radno_vrijeme r ON n.id = r.nightclub_id
                    WHERE n."ime" ILIKE $1
                    OR n."adresa" ILIKE $1
                    OR n."kvart" ILIKE $1
                    
                    GROUP BY n.id;
                `;
                }
            else{
                query = `
                    SELECT n.*, 
                        ARRAY_AGG(r."dan" || ': ' || r."otvaranje" || ' - ' || r."zatvaranje") AS "Radno_vrijeme"
                    FROM nightclubs n
                    LEFT JOIN radno_vrijeme r ON n.id = r.nightclub_id
                    WHERE n."kapacitet" = $1
                    OR n."recenzija" = $1
                    OR n."minimalna_dob_ulaza" = $1
                    GROUP BY n.id;
                `;
                values = [filterValue1]; 
            } 
                
            } else if (["Kapacitet", "Recenzija", "Minimalna_dob_ulaza"].includes(attribute)) {
                
                const filterValue = parseFloat(filter);
                if (isNaN(filterValue)) {
                    return res.status(400).send('Pogrešan unos broja');
                }
                query = `
                    SELECT n.*, 
                        ARRAY_AGG(r."dan" || ': ' || r."otvaranje" || ' - ' || r."zatvaranje") AS "Radno_vrijeme"
                    FROM nightclubs n
                    LEFT JOIN radno_vrijeme r ON n.id = r.nightclub_id
                    WHERE n.${attribute} = $1
                    
                    GROUP BY n.id;
                `;
                values = [filterValue];
            } else {
                
                query = `
                    SELECT n.*, 
                        ARRAY_AGG(r."dan" || ': ' || r."otvaranje" || ' - ' || r."zatvaranje") AS "Radno_vrijeme"
                    FROM nightclubs n
                    LEFT JOIN radno_vrijeme r ON n.id = r.nightclub_id
                    WHERE n.${attribute} ILIKE $1
                    GROUP BY n.id;
                `;
            }

            const result = await pool.query(query, values);
            res.json(result.rows);
        } catch (error) {
            console.error('Greška pri dohvaćanju podataka iz baze:', error);
            res.status(500).send('Greška pri dohvaćanju podataka iz baze');
        }
});



const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

app.use(bodyParser.json());



const swaggerOptions = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Nightclubs API",
      version: "1.0.0",
      description: "RESTful API for managing nightclubs",
      contact: {
        name: "Luka",
        email: "lm55163@fer.hr"
      },
      license: {
        name: "CC0 1.0 Universal",
        url: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
  },
  apis: ["./server.js"], 
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * components:
 *   schemas:
 *     Nightclub:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         ime:
 *           type: string
 *         adresa:
 *           type: string
 *         kvart:
 *           type: string
 *         kapacitet:
 *           type: integer
 *         facebook:
 *           type: string
 *         instagram:
 *           type: string
 *         kontakt:
 *           type: string
 *         recenzija:
 *           type: integer
 *         minimalna_dob_ulaza:
 *           type: integer
 *       required:
 *         - ime
 *         - adresa
 */

/**
 * @swagger
 * /nightclubs:
 *   get:
 *     summary: Get all nightclubs
 *     responses:
 *       200:
 *         description: List of all nightclubs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Nightclub'
 */
app.get("/nightclubs", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM nightclubs");
    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * @swagger
 * /nightclubs/{id}:
 *   get:
 *     summary: Get nightclub by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single nightclub
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Nightclub'
 */
app.get("/nightclubs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM nightclubs WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ status: "error", message: "Nightclub not found" });
    } else {
      res.json({ status: "success", data: result.rows[0] });
    }
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});


/**
 * @swagger
 * /nightclubs/kvart/{kvart}:
 *   get:
 *     summary: Get nightclubs by neighborhood
 *     parameters:
 *       - in: path
 *         name: kvart
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of nightclubs in the specified neighborhood
 */
app.get("/nightclubs/kvart/:kvart", async (req, res) => {
  try {
    const { kvart } = req.params;
    const result = await pool.query("SELECT * FROM nightclubs WHERE kvart ILIKE  $1", [kvart]);
    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * @swagger
 * /nightclubs:
 *   post:
 *     summary: Create a new nightclub
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Nightclub'
 *     responses:
 *       201:
 *         description: Nightclub created successfully
 *       500:
 *          description: Error accured!
 */
app.post("/nightclubs", async (req, res) => {
  try {
    const { ime, adresa, kvart, kapacitet, facebook, instagram, kontakt, recenzija, minimalna_dob_ulaza } = req.body;
    const result = await pool.query(
      "INSERT INTO nightclubs (ime, adresa, kvart, kapacitet, facebook, instagram, kontakt, recenzija, minimalna_dob_ulaza) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
      [ime, adresa, kvart, kapacitet, facebook, instagram, kontakt, recenzija, minimalna_dob_ulaza]
    );
    res.status(201).json({ status: "success", data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * @swagger
 * /nightclubs/{id}:
 *   put:
 *     summary: Update a nightclub
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Nightclub'
 *     responses:
 *       200:
 *         description: Nightclub updated successfully
 *       500:
 *          description: Nightclub not found
 */
app.put("/nightclubs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { ime, adresa, kvart, kapacitet, facebook, instagram, kontakt, recenzija, minimalna_dob_ulaza } = req.body;
    const result = await pool.query(
      "UPDATE nightclubs SET ime = $1, adresa = $2, kvart = $3, kapacitet = $4, facebook = $5, instagram = $6, kontakt = $7, recenzija = $8, minimalna_dob_ulaza = $9 WHERE id = $10 RETURNING *",
      [ime, adresa, kvart, kapacitet, facebook, instagram, kontakt, recenzija, minimalna_dob_ulaza, id]
    );
    res.json({ status: "success", data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * @swagger
 * /nightclubs/{id}:
 *   delete:
 *     summary: Delete a nightclub
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Nightclub deleted successfully
 *       500:
 *          description: Nightclub not found
 */
app.delete("/nightclubs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM nightclubs WHERE id = $1", [id]);
    res.json({ status: "success", message: "Nightclub deleted" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});






app.listen(port, () => {
    console.log(`Server je pokrenut na http://localhost:${port}`);
});
