use clap::Clap;
use std::path::PathBuf;

#[derive(Clap, Debug)]
#[clap(
    version = "0.0.0",
    author = "Edward Faulkner <edward@eaf4.com>",
    about = "The webserver for mho ServiceWorker-based builds."
)]
pub struct ProjectConfig {
    /// Path to your project (defaults to current working directory)
    #[clap(
        short = 'p',
        long = "project-root",
        value_name = "DIR",
        default_value = ".",
        hide_default_value = true
    )]
    pub root: PathBuf,

    /// Serve a locally-built copy of the worker JavaScript instead of the built-in copy
    #[clap(short, long = "worker-js", value_name = "DIR")]
    pub worker: Option<PathBuf>,

    /// Optionally serve a local directory of prebuilt packages at /deps/
    #[clap(short, long, value_name = "DIR")]
    pub deps: Option<PathBuf>,
}

pub fn options() -> ProjectConfig {
    let mut opts: ProjectConfig = ProjectConfig::parse();

    opts.root = opts.root.canonicalize().unwrap();
    opts.deps = opts.deps.map(|d| d.canonicalize().unwrap());
    opts.worker = opts.worker.map(|d| d.canonicalize().unwrap());

    opts
}
