const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.static('public'));
const port = 3000;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'NocniKlubovi',
    password: 'luka',  
    port: 5432,
});
const { parse } = require('json2csv'); 
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






app.listen(port, () => {
    console.log(`http://localhost:${port}`);
});
