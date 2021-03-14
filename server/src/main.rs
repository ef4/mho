#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;
#[macro_use]
extern crate serde_derive;

#[cfg(test)]
mod tests;

mod cache_headers;

use cache_headers::CacheHeaders;

use rocket::fairing::AdHoc;
use rocket::response::content::Html;
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

#[get("/<path..>", rank = 9)]
async fn files<'r>(
    path: PathBuf,
    project: State<ProjectConfig, 'r>,
) -> Option<CacheHeaders<NamedFile>> {
    let target;
    let mut long_lived = false;
    if path == PathBuf::from("mho-client.js") || path == PathBuf::from("mho-worker.js") {
        target = project.worker.join(path);
    } else if path.starts_with("deps") {
        target = project.deps.join(path.strip_prefix("deps").ok()?);
        long_lived = true;
    } else {
        target = project.root.join(path);
    }

    println!("attempting to serve {}", target.display());
    let named = NamedFile::open(target).await.ok()?;
    if long_lived {
        Some(CacheHeaders::immutable(named))
    } else {
        CacheHeaders::etag(named).await
    }
}

struct ProjectConfig {
    root: PathBuf,
    worker: PathBuf,
    deps: PathBuf,
    scaffolding: PathBuf,
}

#[launch]
fn rocket() -> rocket::Rocket {
    let project = ProjectConfig {
        root: PathBuf::from("../ember-app"),
        worker: PathBuf::from("../worker/dist"),
        deps: PathBuf::from("../deps/dist"),
        scaffolding: PathBuf::from("../out-ember-app/ember-app"),
    };
    rocket::ignite()
        .attach(AdHoc::on_response("Identify Server", |_, res| {
            Box::pin(async move {
                res.set_header(rocket::http::Header::new(
                    "Server",
                    "use-the-platform (Rocket)",
                ));
            })
        }))
        .mount("/", routes![bootstrap, manifest, files])
        .mount(
            "/scaffolding",
            StaticFiles::new(project.scaffolding.to_owned(), Options::None).rank(4),
        )
        .manage(project)
}
