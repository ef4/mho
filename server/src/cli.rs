// (Full example with detailed comments in examples/01a_quick_example.rs)
//
// This example demonstrates clap's "usage strings" method of creating arguments
// which is less verbose
use clap::Clap;
use std::path::PathBuf;

#[derive(Clap)]
#[clap(
    version = "0.0.0",
    author = "Edward Faulkner <edward@eaf4.com>",
    about = "The webserver for mho ServiceWorker-based builds."
)]
struct Opts {
    /// Path to your project (defaults to current working directory)
    #[clap(short, long, value_name = "DIR")]
    project_root: Option<PathBuf>,

    /// Optionally serve a local directory of prebuilt packages at /deps/
    #[clap(short, long, value_name = "DIR")]
    deps: Option<PathBuf>,

    /// Serve a locally-built copy of the worker JavaScript instead of the built-in copy
    #[clap(short, long, value_name = "DIR")]
    worker_js: Option<PathBuf>,
}

pub struct ProjectConfig {
    pub root: PathBuf,
    pub worker: Option<PathBuf>,
    pub deps: Option<PathBuf>,
}

pub fn options() -> ProjectConfig {
    let opts: Opts = Opts::parse();

    let root = match opts.project_root {
        Some(d) => d,
        None => PathBuf::from("."),
    }
    .canonicalize()
    .unwrap();

    let deps = match opts.deps {
        // using unwrap on purpose here so you get a crash instead of an ignored
        // option
        Some(d) => Some(d.canonicalize().unwrap()),
        None => None,
    };

    let worker = match opts.worker_js {
        // using unwrap on purpose here so you get a crash instead of an ignored
        // option
        Some(d) => Some(d.canonicalize().unwrap()),
        None => None,
    };

    ProjectConfig { deps, worker, root }
}
