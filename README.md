# 🌐 Plataforma de Traducción Simultánea con IA (Real-Time)

Una solución de grado Enterprise para eventos en vivo, congresos y auditorios. Esta plataforma captura el audio del orador en tiempo real, lo procesa mediante inteligencia artificial neuronal, y lo distribuye a la audiencia tanto en texto (teleprompter) como en audio sintetizado en múltiples idiomas simultáneamente.

## 🚀 Arquitectura del Sistema

El proyecto está dividido en dos microservicios altamente optimizados:

1. **Frontend (Vercel):** Construido en React + Vite + Tailwind CSS. Interfaces adaptativas para el Administrador Master, el Orador (Dashboard de control), la Audiencia (App Web Móvil) y el Proyector (Modo TV Fantasma).
2. **Backend (Render):** Servidor Node.js / Express acoplado con Socket.io para la transmisión bidireccional de baja latencia.

## 🧠 Motor de Inteligencia Artificial

Integración profunda con **Microsoft Azure Cognitive Services**:
* **Speech-to-Text & Translation:** Reconocimiento continuo con segmentación dinámica y filtro activo de lenguaje ofensivo (Profanity Masking).
* **Text-to-Speech (Neural):** Síntesis de voz ultrarrealista en 5 idiomas (ES, EN, DE, FR, PT) con control de género vocal y optimización de latencia.

## 🛡️ Seguridad y Estabilidad

* **Aislamiento Multitenant:** Sistema de "Salas" y "Eventos" mediante llaves criptográficas efímeras. Un evento no interfiere con el tráfico de otro.
* **Kill Switch Global:** Control maestro para apagar la transmisión de eventos específicos o de toda la central en caso de emergencia.
* **Blindaje de Infraestructura:** * Restricción de CORS estricta.
    * Recolección de basura (Garbage Collection) forzada en desconexiones.
    * Monitoreo de memoria y protección contra excepciones no capturadas de Node.js.

## 💻 Instalación y Despliegue Local

1. Clonar el repositorio.
2. Configurar variables de entorno `.env` en Backend (Credenciales de Azure, Master Passwords, Frontend URL).
3. `npm install` en ambos directorios (frontend y backend).
4. `npm run dev` para iniciar los entornos locales.