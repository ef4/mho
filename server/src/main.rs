#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;
#[macro_use]
extern crate serde_derive;

#[cfg(test)]
mod tests;

use rocket::fairing::AdHoc;
use rocket::handler::Outcome;
use rocket::response::content::Html;
use rocket::response::NamedFile;
use rocket::response::{self, Responder, Response};
use rocket::State;
use rocket::{Data, Request};

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
    let name = entry.path().strip_prefix(root).ok()?.to_str()?;
    let meta = fs::metadata(entry.path()).ok()?;
    let modified = meta.modified().ok()?;
    let duration = modified
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .ok()?;
    Some((name.to_owned(), duration.as_secs().to_string()))
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    etags: std::collections::BTreeMap<String, String>,
}

#[get("/")]
fn bootstrap() -> Html<&'static str> {
    Html("<!DOCTYPE html><body data-launching-service-worker><script type=\"module\" src=\"/client.js\"></script>Launching service worker...</body>")
}

#[get("/manifest")]
fn manifest(project: State<ProjectConfig>) -> Json<Manifest> {
    let mut etags = BTreeMap::new();
    let walker = WalkDir::new(&project.root)
        .into_iter()
        .filter_entry(|e| !is_hidden(e) && !is_node_modules(e))
        .filter_map(|e| e.ok());
    for entry in walker {
        if entry.file_type().is_file() {
            if let Some((name, etag)) = summarize(&entry, &project.root) {
                etags.insert(name, etag);
            }
        }
    }
    Json(Manifest { etags })
}

#[get("/client.js")]
async fn client_js<'r>(project: State<ProjectConfig, 'r>) -> Option<NamedFile> {
    NamedFile::open(project.worker.join("client.js")).await.ok()
}

#[get("/worker.js")]
async fn worker_js<'r>(project: State<ProjectConfig, 'r>) -> Option<NamedFile> {
    NamedFile::open(project.worker.join("worker.js")).await.ok()
}

#[derive(Debug, Clone, PartialEq)]
pub struct ETag<R>(pub String, pub R);
impl<'r, 'o: 'r, R: Responder<'r, 'o>> Responder<'r, 'o> for ETag<R> {
    fn respond_to(self, req: &'r Request<'_>) -> response::Result<'o> {
        Response::build()
            .merge(self.1.respond_to(req)?)
            .header(rocket::http::Header::new("Etag", format!("\"{}\"", self.0)))
            .ok()
    }
}

#[get("/<path..>", rank = 10)]
async fn app_files<'r>(
    path: PathBuf,
    project: State<ProjectConfig, 'r>,
) -> Option<ETag<NamedFile>> {
    let named = NamedFile::open(project.root.join(path)).await.ok()?;
    let meta = named.file().metadata().await.ok()?;
    let modified = meta.modified().ok()?;
    let duration = modified
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .ok()?;
    let etag = duration.as_secs().to_string();
    Some(ETag(etag, named))
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
        .mount(
            "/",
            routes![bootstrap, manifest, client_js, worker_js, app_files],
        )
        // .mount(
        //     "/",
        //     StaticFiles::new(
        //         project.root.to_owned(),
        //         Options::Index | Options::DotFiles | Options::NormalizeDirs,
        //     )
        //     .rank(1),
        // )
        .mount(
            "/deps",
            StaticFiles::new(project.deps.to_owned(), Options::None).rank(3),
        )
        .mount(
            "/scaffolding",
            StaticFiles::new(project.scaffolding.to_owned(), Options::None).rank(4),
        )
        .manage(project)
}
