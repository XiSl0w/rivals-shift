using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("Rival Shift Installer")]
[assembly: AssemblyProduct("Rival Shift")]
[assembly: AssemblyVersion("__VERSION__.0")]
[assembly: AssemblyFileVersion("__VERSION__.0")]

internal static class InstallerProgram
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallerWindow(Array.Exists(args, delegate(string value) { return value == "--preview-complete"; })));
    }
}

internal sealed class InstallerWindow : Form
{
    private const string Version = "__VERSION__";
    private readonly Color Background = Color.FromArgb(9, 10, 15);
    private readonly Color Panel = Color.FromArgb(15, 16, 23);
    private readonly Color Muted = Color.FromArgb(126, 127, 142);
    private readonly Label pathLabel;
    private readonly Label statusLabel;
    private readonly Label eyebrowLabel;
    private readonly Label titleLabel;
    private readonly Label subtitleLabel;
    private readonly Label locationLabel;
    private readonly Label artTitleLabel;
    private readonly Label artCopyLabel;
    private readonly Label successMark;
    private readonly Panel featureRow;
    private readonly Panel pathPanel;
    private readonly Button browseButton;
    private readonly PictureBox artLogo;
    private readonly GradientButton installButton;
    private readonly Button cancelButton;
    private readonly InstallerProgress progress;
    private readonly Panel finishPanel;
    private readonly Label finishPathLabel;
    private string installPath;
    private bool installing;
    private bool installed;

    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hWnd, int attribute, ref int value, int size);

    public InstallerWindow(bool previewComplete)
    {
        installPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Rival Shift");
        Text = "Rival Shift Installer";
        ClientSize = new Size(920, 590);
        MinimumSize = MaximumSize = Size;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        BackColor = Background;
        ForeColor = Color.FromArgb(244, 244, 247);
        Font = new Font("Segoe UI", 9F, FontStyle.Regular);
        DoubleBuffered = true;
        var setupIcon = LoadInstallerIcon();
        if (setupIcon != null) Icon = setupIcon;

        var top = new Panel { Bounds = new Rectangle(0, 0, 920, 50), BackColor = Color.FromArgb(8, 9, 13) };
        top.MouseDown += DragWindow;
        Controls.Add(top);
        top.Controls.Add(new PictureBox { Image = LoadLogoImage(), Bounds = new Rectangle(15, 10, 30, 30), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent });
        top.Controls.Add(new Label { Text = "RIVAL SHIFT  /  INSTALLER", Bounds = new Rectangle(53, 0, 260, 50), TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.FromArgb(207, 208, 218), Font = new Font("Segoe UI", 9F, FontStyle.Bold) });
        top.Controls.Add(WindowButton("\u2212", 822, delegate { WindowState = FormWindowState.Minimized; }));
        top.Controls.Add(WindowButton("\u00d7", 870, delegate { Close(); }));

        var art = new GlowPanel { Bounds = new Rectangle(55, 89, 290, 378), BackColor = Color.Transparent };
        Controls.Add(art);
        artLogo = new PictureBox { Bounds = new Rectangle(85, 65, 120, 120), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent };
        artLogo.Image = LoadLogoImage();
        art.Controls.Add(artLogo);
        successMark = new Label { Text = "\u2713", Bounds = new Rectangle(91, 71, 108, 108), TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.FromArgb(224, 255, 199), BackColor = Color.FromArgb(49, 85, 48), Font = new Font("Segoe UI", 42F, FontStyle.Bold), Visible = false };
        art.Controls.Add(successMark);
        artTitleLabel = new Label { Text = "SWITCH. TRACK. PLAY.", Bounds = new Rectangle(20, 220, 250, 30), TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.White, BackColor = Color.Transparent, Font = new Font("Segoe UI", 13F, FontStyle.Bold) };
        art.Controls.Add(artTitleLabel);
        artCopyLabel = new Label { Text = "Your Marvel Rivals accounts, live lobby intelligence, and performance history in one place.", Bounds = new Rectangle(28, 259, 234, 54), TextAlign = ContentAlignment.TopCenter, ForeColor = Color.FromArgb(148, 149, 164), BackColor = Color.Transparent, Font = new Font("Segoe UI", 9F) };
        art.Controls.Add(artCopyLabel);

        eyebrowLabel = new Label { Text = "WELCOME TO", Bounds = new Rectangle(405, 94, 300, 18), ForeColor = Color.FromArgb(160, 124, 244), Font = new Font("Segoe UI", 8F, FontStyle.Bold) };
        Controls.Add(eyebrowLabel);
        titleLabel = new Label { Text = "Rival Shift", Bounds = new Rectangle(400, 119, 440, 57), ForeColor = Color.White, Font = new Font("Segoe UI", 31F, FontStyle.Bold) };
        Controls.Add(titleLabel);
        subtitleLabel = new Label { Text = "A focused Marvel Rivals account hub, ready for this PC.", Bounds = new Rectangle(405, 180, 430, 26), ForeColor = Muted, Font = new Font("Segoe UI", 10F) };
        Controls.Add(subtitleLabel);

        featureRow = new Panel { Bounds = new Rectangle(405, 225, 445, 44), BackColor = Color.Transparent };
        featureRow.Controls.Add(Pill("LIVE GAME", 0, 106));
        featureRow.Controls.Add(Pill("QUICK SWITCH", 116, 126));
        featureRow.Controls.Add(Pill("MULTI-BROWSER", 252, 135));
        Controls.Add(featureRow);

        locationLabel = new Label { Text = "INSTALL LOCATION", Bounds = new Rectangle(405, 299, 200, 18), ForeColor = Color.FromArgb(111, 112, 127), Font = new Font("Segoe UI", 8F, FontStyle.Bold) };
        Controls.Add(locationLabel);
        pathPanel = new Panel { Bounds = new Rectangle(405, 323, 445, 49), BackColor = Panel };
        pathPanel.Paint += delegate(object sender, PaintEventArgs e) { using (var pen = new Pen(Color.FromArgb(38, 39, 51))) e.Graphics.DrawRectangle(pen, 0, 0, pathPanel.Width - 1, pathPanel.Height - 1); };
        pathLabel = new Label { Bounds = new Rectangle(14, 0, 333, 49), TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.FromArgb(177, 178, 190), AutoEllipsis = true, Text = installPath };
        browseButton = new Button { Text = "Change", Bounds = new Rectangle(351, 8, 84, 33), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(25, 26, 36), ForeColor = Color.FromArgb(187, 165, 240), Cursor = Cursors.Hand };
        browseButton.FlatAppearance.BorderColor = Color.FromArgb(48, 43, 65);
        browseButton.Click += ChooseLocation;
        pathPanel.Controls.Add(pathLabel);
        pathPanel.Controls.Add(browseButton);
        Controls.Add(pathPanel);

        statusLabel = new Label { Text = "Ready to install  \u00b7  Version " + Version, Bounds = new Rectangle(405, 391, 445, 23), ForeColor = Muted };
        Controls.Add(statusLabel);
        progress = new InstallerProgress { Bounds = new Rectangle(405, 422, 445, 5), Visible = false };
        Controls.Add(progress);

        finishPanel = new FinishSurface { Bounds = new Rectangle(0, 50, 920, 453), Visible = false };
        finishPanel.Controls.Add(new SuccessBadge { Bounds = new Rectangle(70, 54, 78, 78) });
        finishPanel.Controls.Add(new Label { Text = "INSTALLATION COMPLETE", Bounds = new Rectangle(174, 52, 320, 20), BackColor = Color.Transparent, ForeColor = Color.FromArgb(167, 235, 126), Font = new Font("Segoe UI", 8F, FontStyle.Bold) });
        finishPanel.Controls.Add(new Label { Text = "Rival Shift is ready.", Bounds = new Rectangle(169, 75, 630, 52), BackColor = Color.Transparent, ForeColor = Color.White, Font = new Font("Segoe UI", 28F, FontStyle.Bold) });
        finishPanel.Controls.Add(new Label { Text = "Your account hub is installed and your setup is waiting inside.", Bounds = new Rectangle(174, 132, 610, 26), BackColor = Color.Transparent, ForeColor = Color.FromArgb(147, 149, 164), Font = new Font("Segoe UI", 10F) });

        var nextCard = new CompletionCard { Bounds = new Rectangle(70, 194, 780, 128) };
        nextCard.Controls.Add(new Label { Text = "01", Bounds = new Rectangle(22, 22, 39, 39), TextAlign = ContentAlignment.MiddleCenter, BackColor = Color.FromArgb(35, 27, 54), ForeColor = Color.FromArgb(185, 153, 255), Font = new Font("Segoe UI", 9F, FontStyle.Bold) });
        nextCard.Controls.Add(new Label { Text = "OPEN RIVAL SHIFT", Bounds = new Rectangle(78, 19, 320, 20), BackColor = Color.Transparent, ForeColor = Color.FromArgb(235, 235, 241), Font = new Font("Segoe UI", 8F, FontStyle.Bold) });
        nextCard.Controls.Add(new Label { Text = "We’ll take you straight to Getting Started so you can finish setting up your accounts.", Bounds = new Rectangle(78, 43, 420, 42), BackColor = Color.Transparent, ForeColor = Color.FromArgb(139, 141, 156), Font = new Font("Segoe UI", 9F) });
        nextCard.Controls.Add(StatusPill("APP INSTALLED", 536, 20, 205));
        nextCard.Controls.Add(StatusPill("SETTINGS KEPT SAFE", 536, 67, 205));
        finishPanel.Controls.Add(nextCard);

        var locationCard = new CompletionCard { Bounds = new Rectangle(70, 338, 780, 67) };
        locationCard.Controls.Add(new Label { Text = "⌂", Bounds = new Rectangle(20, 15, 36, 36), TextAlign = ContentAlignment.MiddleCenter, BackColor = Color.FromArgb(25, 23, 36), ForeColor = Color.FromArgb(166, 132, 242), Font = new Font("Segoe UI Symbol", 15F, FontStyle.Bold) });
        locationCard.Controls.Add(new Label { Text = "INSTALLED TO", Bounds = new Rectangle(70, 12, 130, 17), BackColor = Color.Transparent, ForeColor = Color.FromArgb(94, 96, 111), Font = new Font("Segoe UI", 7F, FontStyle.Bold) });
        finishPathLabel = new Label { Text = installPath, Bounds = new Rectangle(70, 29, 675, 25), AutoEllipsis = true, BackColor = Color.Transparent, ForeColor = Color.FromArgb(185, 186, 197), Font = new Font("Segoe UI", 9F) };
        locationCard.Controls.Add(finishPathLabel);
        finishPanel.Controls.Add(locationCard);
        Controls.Add(finishPanel);

        var divider = new Panel { Bounds = new Rectangle(0, 503, 920, 1), BackColor = Color.FromArgb(31, 32, 41) };
        Controls.Add(divider);
        Controls.Add(new Label { Text = "v" + Version + "  \u00b7  WINDOWS 10/11", Bounds = new Rectangle(55, 528, 240, 24), ForeColor = Color.FromArgb(85, 87, 101), Font = new Font("Segoe UI", 8F, FontStyle.Bold) });
        cancelButton = new Button { Text = "Cancel", Bounds = new Rectangle(632, 519, 94, 43), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(21, 22, 30), ForeColor = Color.FromArgb(188, 189, 199), Cursor = Cursors.Hand };
        cancelButton.FlatAppearance.BorderColor = Color.FromArgb(47, 48, 60);
        cancelButton.Click += delegate { Close(); };
        Controls.Add(cancelButton);
        installButton = new GradientButton { Text = "Install", Bounds = new Rectangle(738, 519, 126, 43), Cursor = Cursors.Hand };
        installButton.Click += InstallClicked;
        Controls.Add(installButton);

        if (previewComplete) { installed = true; ShowInstalledState(); }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        var dark = 1;
        DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
        var corners = 2;
        DwmSetWindowAttribute(Handle, 33, ref corners, sizeof(int));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using (var pen = new Pen(Color.FromArgb(42, 43, 55))) e.Graphics.DrawRectangle(pen, 0, 0, ClientSize.Width - 1, ClientSize.Height - 1);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (installing && MessageBox.Show(this, "Installation is still running. Exit anyway?", "Rival Shift", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) e.Cancel = true;
        base.OnFormClosing(e);
    }

    private Button WindowButton(string text, int x, Action action)
    {
        var button = new Button { Text = text, Bounds = new Rectangle(x, 0, 48, 50), FlatStyle = FlatStyle.Flat, BackColor = Color.Transparent, ForeColor = Color.FromArgb(173, 175, 185), Font = new Font("Segoe UI", 13F), Cursor = Cursors.Hand };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(28, 29, 38);
        button.Click += delegate { action(); };
        return button;
    }

    private static Image LoadLogoImage()
    {
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("RivalShiftIcon"))
        {
            if (stream == null) return null;
            using (var source = Image.FromStream(stream)) return new Bitmap(source);
        }
    }

    private static Icon LoadInstallerIcon()
    {
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("RivalShiftSetupIcon"))
        {
            if (stream == null) return null;
            using (var source = new Icon(stream)) return (Icon)source.Clone();
        }
    }

    private Label Pill(string text, int x, int width)
    {
        var label = new Label { Text = "\u2022  " + text, Bounds = new Rectangle(x, 4, width, 34), TextAlign = ContentAlignment.MiddleCenter, BackColor = Color.FromArgb(19, 17, 27), ForeColor = Color.FromArgb(172, 147, 231), Font = new Font("Segoe UI", 7.5F, FontStyle.Bold) };
        return label;
    }

    private Label StatusPill(string text, int x, int y, int width)
    {
        return new Label { Text = "✓   " + text, Bounds = new Rectangle(x, y, width, 32), TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(13, 0, 0, 0), BackColor = Color.FromArgb(17, 23, 20), ForeColor = Color.FromArgb(171, 220, 141), Font = new Font("Segoe UI", 7.5F, FontStyle.Bold) };
    }

    private void DragWindow(object sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        ReleaseCapture();
        SendMessage(Handle, 0xA1, 0x2, 0);
    }

    private void ChooseLocation(object sender, EventArgs e)
    {
        using (var picker = new FolderBrowserDialog { Description = "Choose where Rival Shift will be installed", SelectedPath = installPath, ShowNewFolderButton = true })
            if (picker.ShowDialog(this) == DialogResult.OK) { installPath = picker.SelectedPath; pathLabel.Text = installPath; finishPathLabel.Text = installPath; }
    }

    private async void InstallClicked(object sender, EventArgs e)
    {
        if (installed)
        {
            var executable = Path.Combine(installPath, "Rival Shift.exe");
            if (File.Exists(executable)) Process.Start(executable);
            Close();
            return;
        }
        if (installing) return;
        installing = true;
        installButton.Enabled = false;
        cancelButton.Enabled = false;
        progress.Visible = true;
        progress.Value = 8;
        statusLabel.Text = "Preparing the Rival Shift package...";
        try
        {
            await Task.Run((Action)InstallPayload);
            progress.Value = 100;
            installed = true;
            ShowInstalledState();
            installButton.Enabled = true;
            cancelButton.Enabled = true;
        }
        catch (Exception error)
        {
            progress.Value = 0;
            statusLabel.Text = "Installation could not be completed.";
            MessageBox.Show(this, error.Message, "Rival Shift installation failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            installButton.Enabled = true;
            cancelButton.Enabled = true;
        }
        finally { installing = false; }
    }

    private void ShowInstalledState()
    {
        artLogo.Visible = false;
        successMark.Visible = false;
        eyebrowLabel.Visible = false;
        titleLabel.Visible = false;
        subtitleLabel.Visible = false;
        artTitleLabel.Visible = false;
        artCopyLabel.Visible = false;
        foreach (Control control in Controls)
            if (control is GlowPanel) control.Visible = false;
        featureRow.Visible = false;
        locationLabel.Visible = false;
        pathPanel.Visible = false;
        statusLabel.Visible = false;
        progress.Visible = false;
        progress.Value = 100;
        finishPathLabel.Text = installPath;
        finishPanel.Visible = true;
        finishPanel.BringToFront();
        installButton.Text = "Launch Rival Shift";
        installButton.Width = 162;
        installButton.Left = 702;
        cancelButton.Text = "Close";
        cancelButton.Width = 98;
        cancelButton.Left = 592;
    }

    private void InstallPayload()
    {
        var payloadPath = Path.Combine(Path.GetTempPath(), "rival-shift-payload-" + Guid.NewGuid().ToString("N") + ".exe");
        try
        {
            BackupExistingSettings();
            using (var source = Assembly.GetExecutingAssembly().GetManifestResourceStream("RivalShiftPayload"))
            {
                if (source == null) throw new InvalidOperationException("The installer payload is missing.");
                using (var destination = File.Create(payloadPath)) source.CopyTo(destination);
            }
            BeginInvoke((Action)delegate { progress.Value = 28; statusLabel.Text = "Installing application files..."; });
            var start = new ProcessStartInfo(payloadPath, "/S /D=" + installPath) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(payloadPath) };
            using (var process = Process.Start(start))
            {
                if (process == null) throw new InvalidOperationException("Windows could not start the installation engine.");
                BeginInvoke((Action)delegate { progress.Value = 62; statusLabel.Text = "Creating shortcuts and registering Rival Shift..."; });
                process.WaitForExit();
                if (process.ExitCode != 0) throw new InvalidOperationException("The installation engine exited with code " + process.ExitCode + ".");
            }
            BeginInvoke((Action)delegate { progress.Value = 92; statusLabel.Text = "Finishing installation..."; });
        }
        finally { try { if (File.Exists(payloadPath)) File.Delete(payloadPath); } catch { } }
    }

    private static void BackupExistingSettings()
    {
        var dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "rival-shift");
        var settings = Path.Combine(dataDirectory, "rival-shift.json");
        if (!File.Exists(settings)) return;
        Directory.CreateDirectory(dataDirectory);
        File.Copy(settings, Path.Combine(dataDirectory, "rival-shift.before-install.json"), true);
    }
}

internal sealed class FinishSurface : Panel
{
    public FinishSurface() { DoubleBuffered = true; BackColor = Color.FromArgb(9, 10, 15); }
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (var glow = new GraphicsPath())
        {
            glow.AddEllipse(-110, -185, 520, 420);
            using (var brush = new PathGradientBrush(glow))
            {
                brush.CenterColor = Color.FromArgb(38, 112, 65, 213);
                brush.SurroundColors = new[] { Color.FromArgb(0, 112, 65, 213) };
                e.Graphics.FillPath(brush, glow);
            }
        }
        using (var glow = new GraphicsPath())
        {
            glow.AddEllipse(650, -170, 390, 330);
            using (var brush = new PathGradientBrush(glow))
            {
                brush.CenterColor = Color.FromArgb(20, 121, 190, 77);
                brush.SurroundColors = new[] { Color.FromArgb(0, 121, 190, 77) };
                e.Graphics.FillPath(brush, glow);
            }
        }
        using (var pen = new Pen(Color.FromArgb(31, 32, 42))) e.Graphics.DrawLine(pen, 70, 174, 850, 174);
    }
}

internal sealed class SuccessBadge : Control
{
    public SuccessBadge()
    {
        SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        DoubleBuffered = true;
        BackColor = Color.Transparent;
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var outer = new Rectangle(2, 2, Width - 5, Height - 5);
        using (var shadow = new SolidBrush(Color.FromArgb(25, 143, 96, 233))) e.Graphics.FillEllipse(shadow, outer);
        var inner = new Rectangle(9, 9, Width - 19, Height - 19);
        using (var brush = new LinearGradientBrush(inner, Color.FromArgb(139, 92, 246), Color.FromArgb(95, 211, 115), 45F)) e.Graphics.FillEllipse(brush, inner);
        using (var pen = new Pen(Color.White, 3.4F))
        {
            pen.StartCap = LineCap.Round;
            pen.EndCap = LineCap.Round;
            e.Graphics.DrawLines(pen, new[] { new Point(27, 39), new Point(35, 47), new Point(52, 29) });
        }
    }
}

internal sealed class CompletionCard : Panel
{
    public CompletionCard() { DoubleBuffered = true; BackColor = Color.Transparent; }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(1, 1, Width - 3, Height - 3);
        using (var path = Rounded(rect, 13))
        using (var brush = new LinearGradientBrush(rect, Color.FromArgb(17, 18, 26), Color.FromArgb(12, 13, 19), 0F)) e.Graphics.FillPath(brush, path);
        using (var path = Rounded(rect, 13))
        using (var pen = new Pen(Color.FromArgb(39, 40, 53))) e.Graphics.DrawPath(pen, path);
    }
    private static GraphicsPath Rounded(Rectangle rect, int radius)
    {
        var path = new GraphicsPath(); var d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90); path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90); path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90); path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90); path.CloseFigure(); return path;
    }
}

internal sealed class GradientButton : Button
{
    public GradientButton() { FlatStyle = FlatStyle.Flat; FlatAppearance.BorderSize = 0; ForeColor = Color.White; Font = new Font("Segoe UI", 9F, FontStyle.Bold); }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (var brush = new LinearGradientBrush(ClientRectangle, Enabled ? Color.FromArgb(151, 102, 255) : Color.FromArgb(70, 61, 88), Enabled ? Color.FromArgb(104, 61, 211) : Color.FromArgb(52, 48, 62), 0F)) e.Graphics.FillRectangle(brush, ClientRectangle);
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, Enabled ? ForeColor : Color.FromArgb(135, 130, 145), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }
}

internal sealed class InstallerProgress : Control
{
    private int current;
    public int Value { get { return current; } set { current = Math.Max(0, Math.Min(100, value)); Invalidate(); } }
    public InstallerProgress() { DoubleBuffered = true; BackColor = Color.FromArgb(30, 31, 40); }
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var width = (int)(ClientSize.Width * (Value / 100.0));
        if (width > 0) using (var brush = new LinearGradientBrush(new Rectangle(0, 0, width, Height), Color.FromArgb(139, 92, 246), Color.FromArgb(196, 244, 100), 0F)) e.Graphics.FillRectangle(brush, 0, 0, width, Height);
    }
}

internal sealed class GlowPanel : Panel
{
    public GlowPanel() { DoubleBuffered = true; }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(1, 1, Width - 3, Height - 3);
        using (var path = Rounded(rect, 24))
        using (var brush = new LinearGradientBrush(rect, Color.FromArgb(28, 23, 43), Color.FromArgb(12, 13, 19), 70F)) e.Graphics.FillPath(brush, path);
        using (var path = Rounded(rect, 24))
        using (var pen = new Pen(Color.FromArgb(62, 48, 92))) e.Graphics.DrawPath(pen, path);
    }
    private static GraphicsPath Rounded(Rectangle rect, int radius)
    {
        var path = new GraphicsPath(); var d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90); path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90); path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90); path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90); path.CloseFigure(); return path;
    }
}
