use std::fs::File;
use std::path::Path;
use chrono::{DateTime, NaiveDateTime, Utc};
use anyhow::Result;

/// Extract EXIF date taken from image
pub fn extract_date_taken(path: &Path) -> Option<DateTime<Utc>> {
    let file = File::open(path).ok()?;
    let mut bufreader = std::io::BufReader::new(&file);
    let exifreader = exif::Reader::new();
    let exif = exifreader.read_from_container(&mut bufreader).ok()?;

    // Try DateTimeOriginal first (when photo was taken)
    if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
        if let Some(datetime_str) = field.display_value().to_string().split_whitespace().next() {
            return parse_exif_datetime(datetime_str);
        }
    }

    // Fallback to DateTime
    if let Some(field) = exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY) {
        if let Some(datetime_str) = field.display_value().to_string().split_whitespace().next() {
            return parse_exif_datetime(datetime_str);
        }
    }

    None
}

fn parse_exif_datetime(datetime_str: &str) -> Option<DateTime<Utc>> {
    // EXIF format: "YYYY:MM:DD HH:MM:SS"
    let normalized = datetime_str.replace(':', "-");
    let parts: Vec<&str> = normalized.split_whitespace().collect();

    if parts.len() != 2 {
        return None;
    }

    let date_part = parts[0];
    let time_part = parts.get(1).unwrap_or(&"00:00:00");

    let datetime_combined = format!("{} {}", date_part, time_part);
    NaiveDateTime::parse_from_str(&datetime_combined, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc))
}

/// Get image dimensions
pub fn get_image_dimensions(path: &Path) -> Result<(u32, u32)> {
    let img = image::open(path)?;
    Ok((img.width(), img.height()))
}
