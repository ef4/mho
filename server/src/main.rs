#[macro_use]
extern crate serde_derive;

mod cli;

use cli::ProjectConfig;

use actix_files::NamedFile;
use actix_web::http::header::{CACHE_CONTROL, SERVER};
use actix_web::http::HeaderValue;
use actix_web::middleware::{Compress, DefaultHeaders, Logger};
use actix_web::{get, web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

fn is_hidden(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| s.starts_with("."))
        .unwrap_or(false)
}

fn is_node_modules(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| s == "node_modules")
        .unwrap_or(false)
}

fn summarize(entry: &DirEntry, root: &Path) -> Option<(String, String)> {
    let name = PathBuf::from("/").join(entry.path().strip_prefix(root).ok()?);
    let meta = entry.metadata().ok()?;
    let modified = meta.modified().ok()?;
    let duration = modified
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .ok()?;
    Some((name.to_str()?.to_owned(), duration.as_secs().to_string()))
}

#[get("/")]
async fn bootstrap() -> impl Responder {
    HttpResponse::Ok()
        .content_type("text/html")
        .body("<!DOCTYPE html><body data-launching-service-worker><script type=\"module\" src=\"/mho-client.js\"></script>Launching service worker...</body>")
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    // the etag for each URL on our origin. If it's not present here, it doesn't
    // exist, with the exception of the exclude list below.
    files: BTreeMap<String, String>,

    // list of urls or url prefixes (ones ending in "/") that are not considered
    // part of our manifest. If they're not in the manifest, that doesn't mean
    // they don't exist.
    excluded: Vec<String>,
}

#[get("/manifest")]
async fn manifest(project: web::Data<ProjectConfig>) -> impl Responder {
    let files = WalkDir::new(&project.root)
        .into_iter()
        .filter_entry(|e| !is_hidden(e) && !is_node_modules(e))
        .filter_map(|e| e.ok())
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| summarize(&entry, &project.root))
        .collect();

    web::Json(Manifest {
        files,
        excluded: vec![
            // TODO: we can drop deps from this list when nobody has passed that
            // command line option
            "/deps/".to_string(),
            "/mho-client.js".to_string(),
            "/mho-worker.js".to_string(),
        ],
    })
}

#[get("/mho-client.js")]
async fn client_js_static() -> impl Responder {
    HttpResponse::Ok()
        .content_type("text/javascript")
        .body(std::include_str!("../../worker/dist/mho-client.js"))
}

#[get("/mho-worker.js")]
async fn worker_js_static() -> impl Responder {
    HttpResponse::Ok()
        .content_type("text/javascript")
        .body(std::include_str!("../../worker/dist/mho-worker.js"))
}

async fn files(
    req: HttpRequest,
    project: web::Data<ProjectConfig>,
) -> actix_web::Result<impl Responder> {
    let path = match req.path().strip_prefix("/") {
        Some(path) => path,
        None => return Ok(HttpResponse::NotFound().finish()),
    };

    let target;
    let mut long_lived = false;
    if project.worker.is_some() && (path == "mho-client.js" || path == "mho-worker.js") {
        target = project.worker.as_ref().unwrap().join(path);
    } else if project.deps.is_some() && path.starts_with("deps/") {
        let dep_path = path.strip_prefix("deps").unwrap();
        target = project.deps.as_ref().unwrap().join(dep_path);
        long_lived = true;
    } else {
        target = project.root.join(path);
    }

    let named = NamedFile::open(target)?.disable_content_disposition();
    let mut response = named.into_response(&req)?;

    if long_lived {
        response.headers_mut().insert(
            CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=604800"),
        )
    }

    Ok(response)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_level(false)
        .format_module_path(false)
        .init();

    let project = cli::options();

    HttpServer::new(move || {
        let mut app = App::new()
            .data(project.clone())
            .wrap(Logger::default())
            .wrap(Compress::default())
            .wrap(DefaultHeaders::default().header(SERVER, "mho (actix)"))
            .service(bootstrap)
            .service(manifest)
            .default_service(web::route().to(files));

        if project.worker.is_none() {
            app = app.service(client_js_static).service(worker_js_static);
        }

        app
    })
    .bind("127.0.0.1:8000")?
    .run()
    .await
}
