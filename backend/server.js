const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = 5000;

mongoose.connect('mongodb://localhost:27017/productivity', { useNewUrlParser: true, useUnifiedTopology: true });

const reportSchema = new mongoose.Schema({
    date: String,
    data: Object
});

const Report = mongoose.model("Report", reportSchema);

app.use(cors());
app.use(express.json());

app.post("/report", async (req, res) => {
    const { date, data } = req.body;
    const report = new Report({ date, data });
    await report.save();
    res.send({ success: true });
});

app.get("/report/:date", async (req, res) => {
    const report = await Report.findOne({ date: req.params.date });
    res.send(report || {});
});

app.listen(PORT, () => console.log("Server running on port", PORT));