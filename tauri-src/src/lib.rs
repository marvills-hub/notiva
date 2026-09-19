use tauri::{
    Emitter,
    Manager,
    RunEvent,
    WebviewUrl,
    WebviewWindowBuilder,
    WindowEvent,
};

fn emit_main_hidden(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("notiva-main-hidden", ());
    }
}

fn close_reminder_overlay(app: &tauri::AppHandle) {
    if let Some(reminder) = app.get_webview_window("reminder") {
        let _ = reminder.close();
    }
}

#[tauri::command]
async fn show_reminder_window(
    app: tauri::AppHandle,
    note_ids: Vec<String>,
) -> Result<(), String> {
    if note_ids.is_empty() {
        return Ok(());
    }

    if let Some(main) = app.get_webview_window("main") {
        let visible = main
            .is_visible()
            .map_err(|error| error.to_string())?;

        let minimized = main
            .is_minimized()
            .map_err(|error| error.to_string())?;

        if visible && !minimized {
            close_reminder_overlay(&app);
            return Ok(());
        }
    }

    if let Some(reminder) = app.get_webview_window("reminder") {
        reminder
            .emit(
                "notiva-update-reminders",
                serde_json::json!({
                    "noteIds": note_ids
                }),
            )
            .map_err(|error| error.to_string())?;

        return Ok(());
    }

    let encoded_ids = note_ids
        .iter()
        .map(|id| urlencoding::encode(id).into_owned())
        .collect::<Vec<String>>()
        .join(",");

    let url = format!(
        "/?reminder=true&noteIds={encoded_ids}"
    );

    WebviewWindowBuilder::new(
        &app,
        "reminder",
        WebviewUrl::App(url.into()),
    )
    .title("Notiva Reminders")
    .fullscreen(true)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(true)
    .shadow(false)
    .focused(false)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
async fn reveal_reminder_window(
    app: tauri::AppHandle,
) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let visible = main
            .is_visible()
            .map_err(|error| error.to_string())?;

        let minimized = main
            .is_minimized()
            .map_err(|error| error.to_string())?;

        if visible && !minimized {
            close_reminder_overlay(&app);
            return Ok(());
        }
    }

    let reminder = app
        .get_webview_window("reminder")
        .ok_or_else(|| {
            "Reminder window was not found.".to_string()
        })?;

    reminder
        .show()
        .map_err(|error| error.to_string())?;

    reminder
        .set_focus()
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
async fn close_reminder_window(
    app: tauri::AppHandle,
) -> Result<(), String> {
    close_reminder_overlay(&app);
    Ok(())
}

#[tauri::command]
async fn open_reminder_note(
    app: tauri::AppHandle,
    note_id: String,
    board_id: String,
) -> Result<(), String> {
    close_reminder_overlay(&app);

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| {
            "Main Notiva window was not found.".to_string()
        })?;

    main
        .show()
        .map_err(|error| error.to_string())?;

    let _ = main.unminimize();

    main
        .set_focus()
        .map_err(|error| error.to_string())?;

    main
        .emit(
            "notiva-open-reminder-note",
            serde_json::json!({
                "noteId": note_id,
                "boardId": board_id
            }),
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            show_reminder_window,
            reveal_reminder_window,
            close_reminder_window,
            open_reminder_note
        ])
        .build(tauri::generate_context!())
        .expect("error while building Notiva");

    app.run(|app_handle, event| {
        match event {
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                if label == "main" {
                    api.prevent_close();

                    if let Some(main) =
                        app_handle.get_webview_window("main")
                    {
                        let _ = main.hide();
                    }

                    emit_main_hidden(app_handle);
                }
            }

            RunEvent::WindowEvent {
                label,
                event: WindowEvent::Focused(true),
                ..
            } => {
                if label == "main" {
                    close_reminder_overlay(app_handle);

                    if let Some(main) =
                        app_handle.get_webview_window("main")
                    {
                        let _ = main.emit(
                            "notiva-main-visible",
                            (),
                        );
                    }
                }
            }

            RunEvent::WindowEvent {
                label,
                event: WindowEvent::Resized(_),
                ..
            } => {
                if label == "main" {
                    if let Some(main) =
                        app_handle.get_webview_window("main")
                    {
                        if main.is_minimized().unwrap_or(false) {
                            emit_main_hidden(app_handle);
                        }
                    }
                }
            }

            _ => {}
        }
    });
}