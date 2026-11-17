//! Standalone CLI benchmark tool for monitoring toolkit-gti process.
//!
//! Usage:
//!   cargo run --bin bench
//!   cargo run --bin bench --release  # More accurate CPU measurements

use std::io::{self, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

/// Sample data collected at each interval
#[derive(Debug, Clone)]
struct Sample {
    elapsed_secs: u64,
    cpu_percent: f32,
    memory_mb: f64,
    threads: usize,
}

/// Statistics tracker
struct Stats {
    samples: Vec<Sample>,
}

impl Stats {
    fn new() -> Self {
        Self {
            samples: Vec::new(),
        }
    }

    fn add(&mut self, sample: Sample) {
        self.samples.push(sample);
    }

    fn cpu_stats(&self) -> (f32, f32, f32) {
        if self.samples.is_empty() {
            return (0.0, 0.0, 0.0);
        }
        let values: Vec<f32> = self.samples.iter().map(|s| s.cpu_percent).collect();
        let min = values.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = values.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let avg = values.iter().sum::<f32>() / values.len() as f32;
        (min, max, avg)
    }

    fn memory_stats(&self) -> (f64, f64, f64) {
        if self.samples.is_empty() {
            return (0.0, 0.0, 0.0);
        }
        let values: Vec<f64> = self.samples.iter().map(|s| s.memory_mb).collect();
        let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let avg = values.iter().sum::<f64>() / values.len() as f64;
        (min, max, avg)
    }

    fn count(&self) -> usize {
        self.samples.len()
    }
}

/// Find the toolkit-gti process
fn find_app_process(sys: &System) -> Option<Pid> {
    sys.processes().iter().find_map(|(pid, process)| {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("toolkit-gti") || name.contains("toolkit_gti") {
            Some(*pid)
        } else {
            None
        }
    })
}

/// Print the header
fn print_header(pid: Pid) {
    println!();
    println!(
        "\x1b[1;36mToolkit Benchmark\x1b[0m - Monitoring: \x1b[1mtoolkit-gti.exe\x1b[0m (PID: {})",
        pid
    );
    println!("\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
    println!(
        "\x1b[1m{:<12} {:>10} {:>14} {:>10}\x1b[0m",
        "Time", "CPU %", "Memory MB", "Threads"
    );
    println!("\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
}

/// Print a sample row
fn print_sample(sample: &Sample) {
    let time_str = format!(
        "{:02}:{:02}:{:02}",
        sample.elapsed_secs / 3600,
        (sample.elapsed_secs % 3600) / 60,
        sample.elapsed_secs % 60
    );

    // Color CPU based on usage
    let cpu_color = if sample.cpu_percent > 50.0 {
        "\x1b[31m" // Red
    } else if sample.cpu_percent > 20.0 {
        "\x1b[33m" // Yellow
    } else {
        "\x1b[32m" // Green
    };

    println!(
        "{:<12} {}{:>9.1}%\x1b[0m {:>13.1} MB {:>10}",
        time_str, cpu_color, sample.cpu_percent, sample.memory_mb, sample.threads
    );
}

/// Print summary statistics
fn print_summary(stats: &Stats) {
    println!();
    println!("\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
    println!("\x1b[1;36mSummary\x1b[0m ({} samples):", stats.count());

    let (cpu_min, cpu_max, cpu_avg) = stats.cpu_stats();
    let (mem_min, mem_max, mem_avg) = stats.memory_stats();

    println!(
        "  \x1b[1mCPU:\x1b[0m    avg \x1b[33m{:.1}%\x1b[0m   max \x1b[31m{:.1}%\x1b[0m   min \x1b[32m{:.1}%\x1b[0m",
        cpu_avg, cpu_max, cpu_min
    );
    println!(
        "  \x1b[1mMemory:\x1b[0m avg \x1b[33m{:.1} MB\x1b[0m   max \x1b[31m{:.1} MB\x1b[0m   min \x1b[32m{:.1} MB\x1b[0m",
        mem_avg, mem_max, mem_min
    );
    println!();
}

fn main() {
    // Setup Ctrl+C handler
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    ctrlc::set_handler(move || {
        r.store(false, Ordering::SeqCst);
    })
    .expect("Error setting Ctrl+C handler");

    // Initialize system
    let mut sys = System::new();

    // Refresh to find process
    sys.refresh_processes_specifics(ProcessesToUpdate::All, ProcessRefreshKind::new().with_cpu());

    // Find the app process
    let pid = match find_app_process(&sys) {
        Some(pid) => pid,
        None => {
            eprintln!("\x1b[31mError:\x1b[0m toolkit-gti process not found.");
            eprintln!("Make sure the app is running (npm run tauri dev).");
            std::process::exit(1);
        }
    };

    print_header(pid);

    let mut stats = Stats::new();
    let start = Instant::now();
    let interval = Duration::from_secs(1);

    // Main loop
    while running.load(Ordering::SeqCst) {
        // Wait for interval
        std::thread::sleep(interval);

        // Refresh process info
        sys.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[pid]),
            ProcessRefreshKind::new().with_cpu().with_memory(),
        );

        // Get process
        let process = match sys.process(pid) {
            Some(p) => p,
            None => {
                eprintln!("\n\x1b[31mProcess terminated.\x1b[0m");
                break;
            }
        };

        // Collect sample
        let sample = Sample {
            elapsed_secs: start.elapsed().as_secs(),
            cpu_percent: process.cpu_usage(),
            memory_mb: process.memory() as f64 / (1024.0 * 1024.0),
            threads: process.tasks().map(|t| t.len()).unwrap_or(0),
        };

        print_sample(&sample);
        io::stdout().flush().unwrap();

        stats.add(sample);
    }

    // Print summary on exit
    if stats.count() > 0 {
        print_summary(&stats);
    }
}
