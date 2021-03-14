// (Full example with detailed comments in examples/01a_quick_example.rs)
//
// This example demonstrates clap's "usage strings" method of creating arguments
// which is less verbose
use clap::App;
use std::path::PathBuf;

pub struct ProjectConfig {
    pub root: PathBuf,
    pub worker: Option<PathBuf>,
    pub deps: Option<PathBuf>,
}

pub fn options() -> ProjectConfig {
    let matches = App::new("mho")
        .version("0.0.0")
        .author("Edward Faulkner <edward@eaf4.com>")
        .about("The webserver for mho ServiceWorker-based builds.")
        .arg("-r, --project-root=[DIR] 'Path to your project (defaults to current working directory)'")
        .arg("-d, --deps=[DIR] 'Optionally serve a local directory of prebuilt packages at /deps/'")
        .arg("-w, --worker-js=[DIR] 'Serve a locally-built copy of the worker JavaScript instead of the built-in copy'")
        .get_matches();

    let root = match matches.value_of("project-root") {
        Some(d) => PathBuf::from(d),
        None => PathBuf::from("."),
    }
    .canonicalize()
    .unwrap();

    let deps = match matches.value_of("deps") {
        // using unwrap on purpose here so you get a crash instead of an ignored
        // option
        Some(d) => Some(PathBuf::from(d).canonicalize().unwrap()),
        None => None,
    };

    let worker = match matches.value_of("worker-js") {
        // using unwrap on purpose here so you get a crash instead of an ignored
        // option
        Some(d) => Some(PathBuf::from(d).canonicalize().unwrap()),
        None => None,
    };

    ProjectConfig { deps, worker, root }
}
