package br.com.iagtp.ebook;

import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Ponte entre o site (frontend/src/services/nativePlayback.ts) e o PlaybackService.
 * update(): liga ou atualiza o player (livro, capítulo, posição no capítulo, capa, tocando/pausado).
 * stop(): desliga.
 * Evento "command": botão do player da notificação ou dos fones ({ command, positionMs }).
 */
@CapacitorPlugin(
        name = "BackgroundPlayback",
        permissions = { @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }) }
)
public class BackgroundPlaybackPlugin extends Plugin {

    private boolean askedNotifications = false;

    @Override
    public void load() {
        PlaybackService.listener = (command, positionMs) -> {
            JSObject data = new JSObject();
            data.put("command", command);
            data.put("positionMs", positionMs);
            notifyListeners("command", data);
        };
    }

    @PluginMethod
    public void update(PluginCall call) {
        Double position = call.getDouble("positionMs", 0.0);
        Double duration = call.getDouble("durationMs", 0.0);
        Intent intent = new Intent(getContext(), PlaybackService.class)
                .setAction(PlaybackService.ACTION_UPDATE)
                .putExtra(PlaybackService.EXTRA_TITLE, call.getString("title", ""))
                .putExtra(PlaybackService.EXTRA_CHAPTER, call.getString("chapter", ""))
                .putExtra(PlaybackService.EXTRA_COVER, call.getString("coverUrl", ""))
                .putExtra(PlaybackService.EXTRA_PLAYING, Boolean.TRUE.equals(call.getBoolean("playing", true)))
                .putExtra(PlaybackService.EXTRA_POSITION, position == null ? 0L : position.longValue())
                .putExtra(PlaybackService.EXTRA_DURATION, duration == null ? 0L : duration.longValue());
        try {
            if (PlaybackService.running) getContext().startService(intent);
            else ContextCompat.startForegroundService(getContext(), intent);
        } catch (Exception e) {
            call.reject("Não foi possível iniciar a leitura em segundo plano: " + e.getMessage());
            return;
        }

        // Android 13+: a notificação da leitura precisa de permissão (pedida uma vez)
        if (Build.VERSION.SDK_INT >= 33 && !askedNotifications && getPermissionState("notifications") != PermissionState.GRANTED) {
            askedNotifications = true;
            requestPermissionForAlias("notifications", call, "notificationsCallback");
            return;
        }
        call.resolve();
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }
}
