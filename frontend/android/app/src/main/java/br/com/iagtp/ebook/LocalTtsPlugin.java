package br.com.iagtp.ebook;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Ponte entre o app (frontend/src/services/localTts.ts) e o LocalTtsEngine (voz gerada no celular).
 * synthesize({ id, text, model, lengthScale, urgent }) -> { path, durationMs, cached }
 * promote({ id }), cancel({ ids }), cancelAll(), info() -> { models, stats }, clearCache()
 */
@CapacitorPlugin(name = "LocalTts")
public class LocalTtsPlugin extends Plugin {

    private LocalTtsEngine engine;

    @Override
    public void load() {
        engine = new LocalTtsEngine(getContext());
    }

    @PluginMethod
    public void synthesize(PluginCall call) {
        String id = call.getString("id");
        String text = call.getString("text", "");
        String model = call.getString("model");
        Float lengthScale = call.getFloat("lengthScale", 1f);
        if (id == null || model == null || text == null || text.trim().isEmpty()) {
            call.reject("Pedido de voz incompleto");
            return;
        }
        engine.synthesize(id, text, model, lengthScale == null ? 1f : lengthScale,
                Boolean.TRUE.equals(call.getBoolean("urgent", false)),
                new LocalTtsEngine.Listener() {
                    @Override
                    public void onDone(File wav, long durationMs, boolean cached) {
                        JSObject ret = new JSObject();
                        ret.put("path", wav.getAbsolutePath());
                        ret.put("durationMs", durationMs);
                        ret.put("cached", cached);
                        call.resolve(ret);
                    }

                    @Override
                    public void onError(String message) {
                        call.reject(message);
                    }
                });
    }

    @PluginMethod
    public void promote(PluginCall call) {
        String id = call.getString("id");
        if (id != null) engine.promote(id);
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        JSArray ids = call.getArray("ids", new JSArray());
        List<String> list = new ArrayList<>();
        try {
            for (int i = 0; i < ids.length(); i++) list.add(ids.getString(i));
        } catch (JSONException ignored) {
        }
        engine.cancel(list);
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        engine.cancelAll();
        call.resolve();
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        JSArray models = new JSArray();
        for (String m : engine.availableModels()) models.put(m);
        ret.put("models", models);
        JSObject stats = new JSObject();
        for (Map.Entry<String, Object> e : engine.stats().entrySet()) stats.put(e.getKey(), e.getValue());
        ret.put("stats", stats);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearCache(PluginCall call) {
        engine.clearCache();
        call.resolve();
    }
}
