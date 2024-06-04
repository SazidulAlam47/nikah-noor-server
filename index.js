import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xyqwep0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server (optional starting in v4.7)
        await client.connect();

        const database = client.db("nikahNoorDB");
        const biodataCollection = database.collection("biodatas");


        const getLastBiodataId = async () => {
            const lastQuery = {};
            const lastOptions = {
                projection: { biodataId: 1, _id: 0 },
            };
            const lastIdObj = await biodataCollection.find(lastQuery, lastOptions).sort({ biodataId: -1 }).limit(1).toArray();
            const lastBiodataId = lastIdObj[0].biodataId;

            return lastBiodataId;
        };



        // biodata collection
        app.put("/biodatas/:email", async (req, res) => {
            const email = req.params.email;
            const biodata = req.body;
            console.log({ email, biodata });

            // check if the user is already have biodata
            const UserQuery = { contactEmail: email };
            const userOptions = {
                projection: { biodataId: 1, _id: 0 },
            };
            const userBioIdObj = await biodataCollection.findOne(UserQuery, userOptions);
            let userBiodataId = userBioIdObj?.biodataId;

            console.log({ oldBioId: userBiodataId });

            // if user don't have biodata then give him new biodataId
            if (!userBiodataId) {
                const lastQuery = {};
                const lastOptions = {
                    projection: { biodataId: 1, _id: 0 },
                };
                const lastIdObj = await biodataCollection.find(lastQuery, lastOptions).sort({ biodataId: -1 }).limit(1).toArray();
                userBiodataId = lastIdObj[0].biodataId + 1;
            }

            console.log({ newBioId: userBiodataId });

            // update biodata
            const filter = { contactEmail: email };
            const options = { upsert: true };
            const UpdatedBiodata = {
                $set: {
                    biodataId: userBiodataId,
                    biodataType: biodata.biodataType,
                    name: biodata.name,
                    profileImage: biodata.profileImage,
                    dateOfBirth: biodata.dateOfBirth,
                    height: biodata.height,
                    weight: biodata.weight,
                    age: biodata.age,
                    occupation: biodata.occupation,
                    race: biodata.race,
                    fathersName: biodata.fathersName,
                    mothersName: biodata.mothersName,
                    permanentDivision: biodata.permanentDivision,
                    presentDivision: biodata.presentDivision,
                    expectedPartnerAge: biodata.expectedPartnerAge,
                    expectedPartnerHeight: biodata.expectedPartnerHeight,
                    expectedPartnerWeight: biodata.expectedPartnerWeight,
                    contactEmail: biodata.contactEmail,
                    mobileNumber: biodata.mobileNumber,
                }
            };
            const result = await biodataCollection.updateOne(filter, UpdatedBiodata, options);
            res.send(result);
        });

        app.get("/biodatas", async (req, res) => {
            const result = await biodataCollection.find().toArray();
            res.send(result);
        });

        app.get("/biodatas/:biodataId", async (req, res) => {
            const biodataId = req.params.biodataId;
            const query = { biodataId: parseInt(biodataId) };
            const result = await biodataCollection.findOne(query);
            res.send(result);
        });

        app.get("/biodatas/email/:email", async (req, res) => {
            const email = req.params.email;
            const query = { contactEmail: email };
            const result = await biodataCollection.findOne(query);
            res.send(result);
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Nikah Noor server is running');
});

app.listen(port, () => {
    console.log(`Nikah Noor server is running on port ${port}`);
});