#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;
#[macro_use]
extern crate serde_derive;

#[cfg(test)]
mod tests;

use rocket_contrib::json::Json;
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

#[derive(Serialize, Deserialize)]
struct Manifest {
    mtimes: std::collections::HashMap<String, u64>,
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

#[get("/manifest")]
fn manifest() -> Json<Manifest> {
    let root = "../ember-app";
    let mut mtimes = HashMap::new();
    let walker = WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| !is_hidden(e) && !is_node_modules(e))
        .filter_map(|e| e.ok());
    for entry in walker {
        if entry.file_type().is_file() {
            if let Some((name, mtime)) = summarize(&entry) {
                mtimes.insert(name[root.len()..].to_owned(), mtime);
            }
        }
    }
    Json(Manifest { mtimes })
}

fn rocket() -> rocket::Rocket {
    rocket::ignite().mount("/", routes![manifest])
}

fn main() {
    rocket().launch();
}
