const sdk = require("microsoft-cognitiveservices-speech-sdk");

class TranslationService {
    constructor(socket, fromLanguage = 'es-CO', toLanguages = ['en', 'pt']) {
        this.socket = socket; // Guardamos el socket para responderle a este cliente específico
        
        // Creamos un flujo (stream) donde inyectaremos el audio en tiempo real
        this.pushStream = sdk.AudioInputStream.createPushStream();
        
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION;

        if (!speechKey || !speechRegion || speechKey === "pega_aqui_tu_clave_de_azure") {
            console.error("[!] ADVERTENCIA: Faltan credenciales válidas de Azure en el archivo .env");
            return;
        }

        // 1. Configuración del servicio
        this.translationConfig = sdk.SpeechTranslationConfig.fromSubscription(speechKey, speechRegion);
        this.translationConfig.speechRecognitionLanguage = fromLanguage;
        
        // Añadimos los idiomas a los que queremos traducir simultáneamente
        toLanguages.forEach(lang => {
            this.translationConfig.addTargetLanguage(lang);
        });

        // 2. Unimos la configuración con el flujo de audio
        const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
        this.recognizer = new sdk.TranslationRecognizer(this.translationConfig, audioConfig);

        // 3. Inicializamos los eventos que detectan la voz
        this.setupEvents();
    }

    setupEvents() {
        // Evento 1: Mientras la persona está hablando (Resultados parciales muy rápidos)
        this.recognizer.recognizing = (s, e) => {
            if (e.result.reason === sdk.ResultReason.TranslatingSpeech) {
                const translations = this.extractTranslations(e.result.translations);
                this.socket.emit('translation-result', { 
                    type: 'partial', 
                    original: e.result.text, 
                    translations 
                });
            }
        };

        // Evento 2: Cuando la persona hace una pausa (Resultado final y preciso de la oración)
        this.recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.TranslatedSpeech) {
                const translations = this.extractTranslations(e.result.translations);
                this.socket.emit('translation-result', { 
                    type: 'final', 
                    original: e.result.text, 
                    translations 
                });
            }
        };

        // Manejo de errores o cancelaciones
        this.recognizer.canceled = (s, e) => {
            console.log(`[Azure] Reconocimiento cancelado o error de red: ${e.reason}`);
        };

        this.recognizer.sessionStopped = (s, e) => {
            console.log(`[Azure] Sesión detenida.`);
            this.recognizer.stopContinuousRecognitionAsync();
        };
    }

    // Método auxiliar para limpiar los datos de traducción que nos entrega Azure
    extractTranslations(translationMap) {
        let result = {};
        // Extraemos explícitamente el inglés y el portugués para este prototipo
        ['en', 'pt'].forEach(lang => {
            result[lang] = translationMap.get(lang);
        });
        return result;
    }

    // Métodos de control
    start() {
        console.log("[Azure] Iniciando motor de traducción continua...");
        if(this.recognizer) this.recognizer.startContinuousRecognitionAsync();
    }

    stop() {
        console.log("[Azure] Deteniendo motor de traducción...");
        if(this.recognizer) this.recognizer.stopContinuousRecognitionAsync();
        if(this.pushStream) this.pushStream.close();
    }

    writeAudio(data) {
        // Aquí recibimos los bytes de audio del frontend y se los pasamos al motor
        if(this.pushStream) this.pushStream.write(data);
    }
}

module.exports = TranslationService;