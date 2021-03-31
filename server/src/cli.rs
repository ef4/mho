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
    #[clap(
        short = 'p',
        long = "project-root",
        value_name = "DIR",
        default_value = ".",
        hide_default_value = true
    )]
    root: PathBuf,

    /// Optionally serve a local directory of prebuilt packages at /deps/
    #[clap(short, long, value_name = "DIR")]
    deps: Option<PathBuf>,

    /// Serve a locally-built copy of the worker JavaScript instead of the built-in copy
    #[clap(short, long = "worker-js", value_name = "DIR")]
    worker: Option<PathBuf>,
}

pub struct ProjectConfig {
    pub root: PathBuf,
    pub worker: Option<PathBuf>,
    pub deps: Option<PathBuf>,
}

pub fn options() -> ProjectConfig {
    let opts: Opts = Opts::parse();

    let root = opts.root.canonicalize().unwrap();
    let deps = opts.deps.map(|d| d.canonicalize().unwrap());
    let worker = opts.worker.map(|d| d.canonicalize().unwrap());

    ProjectConfig { deps, worker, root }
}
