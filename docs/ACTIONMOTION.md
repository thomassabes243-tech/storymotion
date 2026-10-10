# ActionMotion — evolución de StoryMotion

Auditoría de partida: rama `main`, commit `670fffa96063737515db0a7b9168076025707819`, Git limpio y coincidente con origin/main. Implementación aislada en `feat/actionmotion-director-ai`. Se conservan Next.js 16/React 19, Remotion 4, FFmpeg/FFprobe, Sharp, SQLite y filesystem. No se modifica producción.

## Director y contratos

Director → análisis narrativo → storyboard → aprobación → material visual → animación → RenderQueue existente → control de calidad → READY_FOR_REVIEW. Seis módulos especializados comparten proceso y almacenamiento; no son seis servicios ni seis modelos. El modo operativo sin modelo de lenguaje es un director por reglas. El adaptador Ollama usa `/api/generate` con esquema JSON; no hay Ollama/modelo operativo en este entorno, por lo que no se afirma comprensión semántica mediante LLM.

La nueva tabla SQLite `agent_jobs` usa transacciones BEGIN IMMEDIATE para crear/claimar trabajos, conserva snapshots, revisión aprobada, eventos, referencias y escenas completadas. El worker existente ejecuta pasos cortos del director y la cola de render. Reanuda al morir un worker usando identidad del proceso, no solo PID. El storyboard detiene la producción en modo SEMI_AUTO. Reintentos exponenciales limitados a tres; no oculta errores ni regenera escenas ya guardadas. Un render usa una clave estable del trabajo del director y reutiliza caché de planos. SQLite continúa siendo una cola de un único host.

Los valores iniciales son ACTIONMOTION_AGENT_ENABLED=true, ACTIONMOTION_AGENT_MODE=SEMI_AUTO, ACTIONMOTION_REQUIRE_APPROVAL=true y ACTIONMOTION_EXTERNAL_PAID_CALLS=false. El director no llama proveedores comerciales. Una aprobación de storyboard autoriza producción local, no consumo externo ni publicación.

## Continuidad y calidad

Referencias persistentes por personaje/lugar, hash de definición física por plano, posiciones de entrada/salida, dirección espacial y plano anterior. Estas verificaciones comprueban contratos y referencias; no reconocen caras, manos ni deformaciones en píxeles. La identidad visual real exige revisión. No se promete anatomía correcta sin un motor validado.

Rápido: 540×960, CRF 28 para preview; equilibrado: 1080×1920, CRF 20. Cinematográfico: desactivado hasta integrar y evaluar un motor de video auténtico. Reescalar no significa superresolución. No hay modelo generativo de video ni GPU disponible en este entorno.
