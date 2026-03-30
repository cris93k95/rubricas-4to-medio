"""
Servidor Flask para servir las rúbricas de evaluación de 4° Medio.
Sirve los archivos HTML estáticos como páginas web con una landing page de navegación.
"""
import os
from flask import Flask, send_from_directory, render_template_string

app = Flask(__name__, static_folder="static")

LANDING_PAGE = """
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rúbricas 4° Medio — Inglés TP 2026</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            min-height: 100vh;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%);
            color: #f1f5f9;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }
        .container {
            max-width: 700px;
            width: 100%;
        }
        .header {
            text-align: center;
            margin-bottom: 3rem;
        }
        .header h1 {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, #60a5fa, #34d399);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 0.5rem;
        }
        .header p {
            color: #94a3b8;
            font-size: 1.1rem;
        }
        .header .subtitle {
            color: #64748b;
            font-size: 0.9rem;
            margin-top: 0.25rem;
        }
        .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 1rem;
            padding: 2rem;
            margin-bottom: 1.5rem;
            transition: all 0.3s ease;
            text-decoration: none;
            display: block;
            position: relative;
            overflow: hidden;
        }
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            border-radius: 1rem 1rem 0 0;
        }
        .card-video::before {
            background: linear-gradient(90deg, #3b82f6, #6366f1);
        }
        .card-cv::before {
            background: linear-gradient(90deg, #14b8a6, #10b981);
        }
        .card:hover {
            background: rgba(255,255,255,0.1);
            border-color: rgba(255,255,255,0.2);
            transform: translateY(-4px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .card-icon {
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }
        .card h2 {
            font-size: 1.4rem;
            font-weight: 700;
            color: #f1f5f9;
            margin-bottom: 0.5rem;
        }
        .card p {
            color: #94a3b8;
            font-size: 0.9rem;
            line-height: 1.6;
        }
        .card .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-top: 1rem;
        }
        .badge-video {
            background: rgba(99, 102, 241, 0.2);
            color: #818cf8;
            border: 1px solid rgba(99, 102, 241, 0.3);
        }
        .badge-cv {
            background: rgba(20, 184, 166, 0.2);
            color: #5eead4;
            border: 1px solid rgba(20, 184, 166, 0.3);
        }
        .card .arrow {
            position: absolute;
            right: 2rem;
            top: 50%;
            transform: translateY(-50%);
            font-size: 1.5rem;
            color: #475569;
            transition: all 0.3s ease;
        }
        .card:hover .arrow {
            color: #94a3b8;
            transform: translateY(-50%) translateX(4px);
        }
        .footer {
            text-align: center;
            margin-top: 2rem;
            color: #475569;
            font-size: 0.8rem;
        }
        @media (max-width: 640px) {
            .header h1 { font-size: 1.8rem; }
            .card { padding: 1.5rem; }
            .card .arrow { display: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 Rúbricas 4° Medio</h1>
            <p>Herramientas de Evaluación — Inglés TP 2026</p>
            <p class="subtitle">Unidad 1: Professional Profile & Workplace English</p>
        </div>

        <a href="/video" class="card card-video">
            <div class="card-icon">🎬</div>
            <h2>Mock Job Interview — Video</h2>
            <p>Rúbrica para evaluar la entrevista laboral simulada en parejas, presentada en formato de video. Evalúa pronunciación, fluidez, vocabulario técnico, contenido, rol del entrevistador y producción.</p>
            <span class="badge badge-video">7 criterios · 28 pts · En parejas</span>
            <span class="arrow">→</span>
        </a>

        <a href="/cv" class="card card-cv">
            <div class="card-icon">📄</div>
            <h2>Curriculum Vitae en Inglés</h2>
            <p>Rúbrica para evaluar el CV profesional en inglés de cada estudiante. Evalúa estructura, gramática, vocabulario técnico, relevancia del contenido y presentación profesional.</p>
            <span class="badge badge-cv">6 criterios · 24 pts · Individual</span>
            <span class="arrow">→</span>
        </a>

        <div class="footer">
            <p>Liceo Técnico Profesional · Inglés 4° Medio · 2026</p>
        </div>
    </div>
</body>
</html>
"""


@app.route("/")
def landing():
    return render_template_string(LANDING_PAGE)


@app.route("/video")
def video_rubric():
    return send_from_directory("static", "rubrica_video.html")


@app.route("/cv")
def cv_rubric():
    return send_from_directory("static", "rubrica_cv.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
