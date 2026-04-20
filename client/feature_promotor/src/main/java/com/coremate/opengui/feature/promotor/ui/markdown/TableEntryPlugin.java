package com.coremate.opengui.feature.promotor.ui.markdown;

import android.content.Context;

import androidx.annotation.NonNull;

import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.parser.Parser;

import java.util.Collections;

import io.noties.markwon.AbstractMarkwonPlugin;
import io.noties.markwon.ext.tables.TablePlugin;
import io.noties.markwon.ext.tables.TableTheme;

public class TableEntryPlugin extends AbstractMarkwonPlugin {
    @NonNull
    public static TableEntryPlugin create(@NonNull Context context) {
        final TableTheme tableTheme = TableTheme.create(context);
        return create(tableTheme);
    }

    @NonNull
    public static TableEntryPlugin create(@NonNull TableTheme tableTheme) {
        return new TableEntryPlugin(TableEntryTheme.create(tableTheme));
    }

    @NonNull
    public static TableEntryPlugin create(@NonNull TablePlugin.ThemeConfigure themeConfigure) {
        final TableTheme.Builder builder = new TableTheme.Builder();
        themeConfigure.configureTheme(builder);
        return new TableEntryPlugin(new TableEntryTheme(builder));
    }

    @NonNull
    public static TableEntryPlugin create(@NonNull TablePlugin plugin) {
        return create(plugin.theme());
    }

    private final TableEntryTheme theme;

    @SuppressWarnings("WeakerAccess")
    TableEntryPlugin(@NonNull TableEntryTheme tableTheme) {
        this.theme = tableTheme;
    }

    @NonNull
    public TableEntryTheme theme() {
        return theme;
    }

    @Override
    public void configureParser(@NonNull Parser.Builder builder) {
        builder.extensions(Collections.singleton(TablesExtension.create()));
    }
}
