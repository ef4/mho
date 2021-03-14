#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;
#[macro_use]
extern crate serde_derive;

#[cfg(test)]
mod tests;

mod cache_headers;
mod cli;

use cli::ProjectConfig;

use cache_headers::CacheHeaders;

use rocket::fairing::AdHoc;
use rocket::response::content::{Html, JavaScript};
use rocket::response::NamedFile;
use rocket::State;

use rocket_contrib::json::Json;
use rocket_contrib::serve::{Options, StaticFiles};

use std::collections::BTreeMap;
use std::fs;
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
    let meta = fs::metadata(entry.path()).ok()?;
    let modified = meta.modified().ok()?;
    let duration = modified
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .ok()?;
    Some((name.to_str()?.to_owned(), duration.as_secs().to_string()))
}

#[get("/")]
fn bootstrap() -> Html<&'static str> {
    Html("<!DOCTYPE html><body data-launching-service-worker><script type=\"module\" src=\"/mho-client.js\"></script>Launching service worker...</body>")
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    // the etag for each URL on our origin. If it's not present here, it doesn't
    // exist, with the exception of the exclude list below.
    files: std::collections::BTreeMap<String, String>,

    // list of urls or url prefixes (ones ending in "/") that are not considered
    // part of our manifest. If they're not in the manifest, that doesn't mean
    // they don't exist.
    excluded: Vec<String>,
}

#[get("/manifest")]
fn manifest(project: State<ProjectConfig>) -> Json<Manifest> {
    let mut files = BTreeMap::new();
    let walker = WalkDir::new(&project.root)
        .into_iter()
        .filter_entry(|e| !is_hidden(e) && !is_node_modules(e))
        .filter_map(|e| e.ok());
    for entry in walker {
        if entry.file_type().is_file() {
            if let Some((name, etag)) = summarize(&entry, &project.root) {
                files.insert(name, etag);
            }
        }
    }
    Json(Manifest {
        files,
        excluded: vec![
            "/deps/".to_string(),
            "/mho-client.js".to_string(),
            "/mho-worker.js".to_string(),
        ],
    })
}

// this isn't strictly necessary but Rocket emits confusing warnings when its
// default HEAD implementation (which is perfectly fine) handles this instead of
// us.
//
// The service worker uses HEAD /mho-client.js to check that the server is still
// present.
#[head("/mho-client.js")]
async fn client_js_head() -> () {
    ()
}

#[get("/mho-client.js")]
async fn client_js_static() -> JavaScript<&'static str> {
    JavaScript(std::include_str!("../../worker/dist/mho-client.js"))
}

#[get("/mho-server.js")]
async fn worker_js_static() -> JavaScript<&'static str> {
    JavaScript(std::include_str!("../../worker/dist/mho-worker.js"))
}

#[get("/<path..>", rank = 9)]
async fn files<'r>(
    path: PathBuf,
    project: State<ProjectConfig, 'r>,
) -> Option<CacheHeaders<NamedFile>> {
    let target;
    let mut long_lived = false;
    if path == PathBuf::from("mho-client.js") || path == PathBuf::from("mho-worker.js") {
        target = project.worker.as_ref()?.join(path);
    } else if path.starts_with("deps") {
        target = project.deps.as_ref()?.join(path.strip_prefix("deps").ok()?);
        long_lived = true;
    } else {
        target = project.root.join(path);
    }

    let named = NamedFile::open(target).await.ok()?;
    if long_lived {
        Some(CacheHeaders::immutable(named))
    } else {
        CacheHeaders::etag(named).await
    }
}

#[launch]
fn rocket() -> rocket::Rocket {
    let project = cli::options();

    let mut active_routes = routes![bootstrap, manifest, files, client_js_head];
    if project.worker.is_none() {
        let mut worker_routes = routes![client_js_static, worker_js_static];
        active_routes.append(&mut worker_routes);
    }

    rocket::ignite()
        .attach(AdHoc::on_response("Identify Server", |_, res| {
            Box::pin(async move {
                res.set_header(rocket::http::Header::new("Server", "mho (Rocket)"));
            })
        }))
        .mount("/", active_routes)
        .mount(
            "/scaffolding",
            StaticFiles::new(&project.scaffolding, Options::None).rank(4),
        )
        .manage(project)
}
