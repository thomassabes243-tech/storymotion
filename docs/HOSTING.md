# Publicación de StoryMotion

La instalación web incluye Next.js, el worker de render, Chromium y FFmpeg en un contenedor independiente. La web encola los trabajos sin bloquear HTTP; ambos procesos comparten SQLite y assets en un disco persistente. No depende de ClipForge ni necesita narración.

## Instalación publicada

La aplicación está disponible en **https://storymotion.onrender.com**. El navegador pide el usuario **storymotion** y la contraseña de la instalación, entregada al propietario y almacenada en `STORYMOTION_ACCESS_PASSWORD` en Render. La contraseña no se guarda en GitHub.

El servicio independiente `storymotion` utiliza el repositorio `thomassabes243-tech/storymotion`, una instancia Docker y un disco permanente de 1 GB. La publicación inicial usa el commit `921ef41795817e0a3c3a555e6902319a8280269c`. Los despliegues automáticos están desactivados; actualizar documentación en el repositorio no reinicia el servidor.

## Render

`render.yaml` describe una sola instancia Docker con **1 CPU / 2 GB RAM** y **1 GB de disco** en Oregon. Precios consultados el 7 de octubre de 2026: **25 USD/mes + 0,25 USD/mes** por disco, antes de impuestos o cargos por consumo que pudieran corresponder. Comprueba el presupuesto mostrado por Render antes de aplicar. No se activa ningún recurso al subir estos archivos a GitHub.

1. Conecta el repositorio de StoryMotion a Render y abre su Blueprint.
2. En `STORYMOTION_ACCESS_PASSWORD`, escribe una contraseña para tu instalación.
3. Revisa los recursos y el importe; aplica el Blueprint si los aceptas.
4. Espera a que el servicio esté `Live` y abre la URL `.onrender.com` indicada por Render.
5. Al abrir la app, el navegador solicita usuario **storymotion** y la contraseña que configuraste.

El enlace del Blueprint es un enlace de configuración, **no la aplicación publicada**. La URL de la aplicación solo existe después del despliegue correcto.

El disco `/var/data` guarda proyectos, uploads, caché y MP4; un reinicio o despliegue conserva esos datos. Solo hay una instancia: esta versión está destinada a una persona y no incluye cuentas independientes. Web y worker deben permanecer juntos mientras se use SQLite y disco local. Los despliegues se activan manualmente.

El motor usa un proceso de render a la vez y concurrencia de un fotograma en este servidor para reducir memoria. La velocidad depende de la complejidad y duración. Aumentar recursos es una decisión posterior; no se escala automáticamente. El disco inicial puede ampliarse si se acumulan videos.

## Probar el contenedor

```bash
docker build -t storymotion .
docker volume create storymotion-data
docker run --rm -p 10000:10000 -v storymotion-data:/var/data storymotion
```

Abre `http://localhost:10000`. Para comprobar la persistencia, crea un proyecto, detén el contenedor y ejecútalo otra vez con el mismo volumen. `STORYMOTION_ACCESS_PASSWORD` es opcional en local y obligatorio en el Blueprint publicado. No guardes su valor en el repositorio.

`/api/health` queda disponible para el monitor del alojamiento; los proyectos, los assets y las descargas de MP4 requieren acceso cuando existe contraseña. El proceso principal detiene la web si el worker termina. Los trabajos interrumpidos se recuperan al iniciar un nuevo proceso; los segmentos finalizados se reutilizan.

La generación externa de imágenes y el análisis semántico externo siguen siendo opcionales. Sin ellos funcionan assets importados y las ilustraciones provisionales; no se promete calidad artística final de los placeholders.
