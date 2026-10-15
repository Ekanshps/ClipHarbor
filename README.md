# ClipHarbor — YouTube Video & Audio Downloader

ClipHarbor is a responsive web application built with **Flask**, **yt-dlp**, HTML, CSS, and JavaScript. It provides a mobile-friendly interface for reading YouTube video information and downloading supported media as MP4 video or MP3 audio.

> **Use responsibly:** Download only content you own, have permission to download, or are otherwise legally entitled to save. Respect YouTube's Terms of Service, copyright, and applicable laws. This project is provided for educational and personal use; it does not bypass DRM or access controls.

## Creator & Developer

- **Creator:** DevArea
- **Developer:** Ekansh Pratap Singh
- **Portfolio:** [epsingh.in](https://epsingh.in/)

Ekansh Pratap Singh is a web developer and MCA graduate currently training in AI with Python. His work focuses on practical web experiences, responsive interfaces, Python, and applied AI. Learn more on his [portfolio website](https://epsingh.in/).

## Features

- Responsive, mobile-first interface
- YouTube video information lookup
- MP4 video downloads with available quality choices
- MP3 audio extraction
- Downloaded filenames prefixed with `downloaded-from-clipharbor-`
- Background download jobs with status polling
- About, Terms, and Privacy pages
- `robots.txt`, `sitemap.xml`, page metadata, and structured data in the templates
- No user account or login required

## Technology Stack

- **Backend:** Python, Flask, yt-dlp
- **Frontend:** HTML, CSS, JavaScript
- **Media processing:** FFmpeg

## Project Structure

```text
Downloader/
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   ├── base.html
│   ├── index.html
│   ├── about.html
│   ├── terms.html
│   └── privacy.html
└── static/
    ├── app.js
    ├── style.css
    └── favicon.svg
```

The `downloads/` directory is created automatically when the app starts.

## Requirements

- Python 3.10 or newer recommended
- pip
- FFmpeg installed and accessible to the app
- Internet connection

## Local Setup

### 1. Open the project folder

```cmd
cd path\to\Downloader
```

Replace `path\to\Downloader` with the actual location of the project.

### 2. Create and activate a virtual environment

```cmd
python -m venv venv
venv\Scripts\activate
```

On macOS/Linux:

```bash
source venv/bin/activate
```

### 3. Install Python dependencies

```cmd
python -m pip install -r requirements.txt
```

### 4. Install FFmpeg

FFmpeg is required to merge separate video and audio streams and to extract MP3 audio.

On Windows, you can install a package with WinGet:

```cmd
winget install --id Gyan.FFmpeg.Shared -e
```

Close and reopen the terminal, then check:

```cmd
ffmpeg -version
where ffmpeg
```

If FFmpeg is installed but not found by the app, set `ffmpeg_location` in the yt-dlp options to the folder containing `ffmpeg.exe`. The app may use an explicit local FFmpeg path; update `FFMPEG_DIR` in `app.py` to match your own installation. Do not copy another computer's user-specific path unchanged.

### 5. Start the application

```cmd
python app.py
```

Open the local URL shown in the terminal. By default:

```text
http://127.0.0.1:5000
```

Stop the server with `Ctrl+C`.

## Configuration

The application supports these environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `SITE_NAME` | Site name used in the interface and download filename prefix | `ClipHarbor` |
| `SITE_URL` | Canonical site base URL used by sitemap/metadata | `http://127.0.0.1:5000` |
| `SECRET_KEY` | Flask secret key | Development fallback; set your own for deployment |
| `PORT` | Local server port | `5000` |

Example for Windows CMD:

```cmd
set SITE_NAME=ClipHarbor
set SITE_URL=http://127.0.0.1:5000
set SECRET_KEY=replace-with-a-long-random-secret
python app.py
```

For a public deployment, set `SITE_URL` to the real HTTPS domain and configure a production WSGI server and hosting environment.

## Troubleshooting

### `ERROR: You have requested merging of multiple formats but ffmpeg is not installed`

1. Run `where ffmpeg` in the same terminal used to start the app.
2. Confirm that `ffmpeg.exe` exists in the reported installation's `bin` directory.
3. Set `FFMPEG_DIR` in `app.py` to that directory (not to the executable filename).
4. Restart Flask after changing the path.

### yt-dlp is installed but the app cannot find it

Activate the project's virtual environment, then run:

```cmd
python -m pip install -U yt-dlp
python -m yt_dlp --version
python app.py
```

### A video still fails to download

- Update yt-dlp inside the active virtual environment.
- Check the complete terminal error; different videos may fail for different reasons.
- Verify that the video is available to your account/region and that you have permission to download it.
- Some formats require FFmpeg. Network, platform, age, or availability restrictions can also cause failures.

## SEO & Deployment Notes

The project includes basic SEO elements in its templates and sitemap/robots endpoints. Before production deployment:

- Replace the default `SITE_URL` with the public HTTPS domain.
- Review page titles, descriptions, canonical URLs, and structured data.
- Confirm the sitemap contains only publicly accessible canonical pages.
- Add a privacy policy that accurately describes your actual data handling.
- Use a production WSGI server instead of Flask's development server.
- Add rate limiting, request/job limits, storage cleanup, logging, and appropriate security controls.
- Do not expose the development server directly to the public internet.

SEO markup does not guarantee indexing or rankings. Run your own accessibility, performance, and structured-data checks before launch.

## License

No license is specified by default. Add a `LICENSE` file before redistributing this project if you want to grant others explicit reuse rights.

## Credits

Created by **Ekansh**. Developed by **Ekansh Pratap Singh**.  
Portfolio: [https://epsingh.in/](https://epsingh.in/)
