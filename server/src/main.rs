#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;
#[macro_use]
extern crate serde_derive;

#[cfg(test)]
mod tests;

use rocket::State;
use rocket_contrib::json::Json;
use rocket_contrib::serve::{Options, StaticFiles};

use std::collections::HashMap;
use std::fs;
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

fn summarize(entry: &DirEntry) -> Option<(&str, u64)> {
    let name = entry.path().to_str()?;
    let meta = fs::metadata(entry.path()).ok()?;
    let modified = meta.modified().ok()?;
    let duration = modified
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .ok()?;
    Some((name, duration.as_secs()))
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    mtimes: std::collections::HashMap<String, u64>,
}

#[get("/manifest")]
fn manifest(project: State<ProjectConfig>) -> Json<Manifest> {
    let mut mtimes = HashMap::new();
    let walker = WalkDir::new(&*project.root)
        .into_iter()
        .filter_entry(|e| !is_hidden(e) && !is_node_modules(e))
        .filter_map(|e| e.ok());
    for entry in walker {
        if entry.file_type().is_file() {
            if let Some((name, mtime)) = summarize(&entry) {
                mtimes.insert(name[project.root.len()..].to_owned(), mtime);
            }
        }
    }
    Json(Manifest { mtimes })
}

struct ProjectConfig {
    root: &'static str,
    worker: &'static str,
    deps: &'static str,
    scaffolding: &'static str,
}

#[launch]
fn rocket() -> rocket::Rocket {
    let project = ProjectConfig {
        root: "../ember-app",
        worker: "../worker/dist",
        deps: "../deps/dist",
        scaffolding: "../out-ember-app/ember-app",
    };
    rocket::ignite()
        .mount("/", routes![manifest])
        .mount("/", StaticFiles::new(project.root, Options::None).rank(1))
        .mount(
            "/",
            StaticFiles::new(
                project.worker,
                Options::Index | Options::DotFiles | Options::NormalizeDirs,
            )
            .rank(2),
        )
        .mount(
            "/deps",
            StaticFiles::new(project.deps, Options::None).rank(3),
        )
        .mount(
            "/scaffolding",
            StaticFiles::new(project.scaffolding, Options::None).rank(4),
        )
        .manage(project)
}
