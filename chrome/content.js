// Since GitHub/GitLab uses push state to transition between pages, we can't 
// expect this script to be called whenever there is a page change. To
// work around this, we'll check "window.location" every "x" milliseconds
// to see if the location has changed.  If it has, we'll let everybody on 
// callback list know.
//
// To learn more, take look at "js/events/page.js" 

"use strict";

var lastLocation        = null,
    lastShow            = null,
    ignoreHash          = null,
    lastHeight          = null,
    overlayWindow       = null,
    resize              = null,
    peekWidth           = 400,
    origPeekWidth       = peekWidth,
    gitsenseIframe      = null,
    gitsenseFrameId     = "gitsense-content-iframe",
    currentRule         = null,
    lastPageChangedTime = null;

window.addEventListener("message", receiveMessage, false);

//
// The initGitSenseConfig function is defined at the bottom of this script
//
initGitSenseConfig(function() {
    var resizeTimedOut    = 0,
        gitsensePageEvent = new sdes.events.page();

    // Define how frequently to check for window.location changes
    gitsensePageEvent.setTimeout(100); 
    
    // Add the function to call whenever there is a location change
    gitsensePageEvent.addOnChange(pageChanged);
    
    // Start tracking and pass it a true value to force an immediate callback
    gitsensePageEvent.startTracking(true);
});

function pageChanged(rule, force) {
    currentRule = rule;

    lastPageChangedTime = new Date().getTime();

    if ( force === undefined ) 
        force = false;

    // If rule is null, it means this page didn't match any
    // rules, so stop
    if ( rule === null )
        return;

    if ( window.location.pathname.match(/\/search$/) )
        force = true;

    var lastUrl    = lastLocation === null ? null : lastLocation.origin+lastLocation.pathname,
        lastHash   = lastLocation === null ? null : lastLocation.hash,
        lastSearch = lastLocation === null ? null : lastLocation.search,
        thisShow   = window.location.search.match(/gitsense=insight/) ? true : false,
        thisUrl    = window.location.origin+window.location.pathname,
        thisHash   = window.location.hash,
        thisSearch = window.location.search;

    lastLocation = $.extend(true, {}, window.location);

    if ( ! force && lastUrl === thisUrl && lastShow === thisShow ) {
        poll(rule, lastPageChangedTime);
        return;
    }

    lastShow = thisShow;

    switch (rule.host.type) {
        case "github":
            new sdes.github.utils.page(rule).parse(
                function(page) {
                    renderGitHubPage(rule, page)
                },
                force
            );
            break; 
        case "github-ent":
            new sdes.github.utils.page(rule).parse(
                function(page) {
                    renderGitHubPage(rule, page)
                },
                force
            );
            break; 
        case "gitlab":
            new sdes.gitlab.utils.page(rule).parse(
                function(page) {
                    renderGitLabPage(rule, page)
                },
                force
            );
            break; 
        case "gitlab-le":
            new sdes.gitlab.utils.page(rule).parse(
                function(page) {
                    renderGitLabPage(rule, page)
                },
                force
            );
            break; 
        default: 
            throw("GitSense: Unrecognized host provider '"+host+"'");
    }

    function poll(rule, lastTime) {
        if ( lastTime !== lastPageChangedTime )
            return;

        if ( new Date().getTime() > lastTime + 5000 )
            return;

        var frame = document.getElementById(gitsenseFrameId),
            show  = window.location.search.match(/gitsense=insight/) ? true : false;

        if ( frame === null && show )
            pageChanged(rule, true);

        setTimeout(function(){ poll(rule, lastTime); }, 500);
    }
}

function initGitSenseConfig(callback) {
    // sdes.config is defined in the js/config.js file
    chrome.storage.local.get(
        sdes.config,
        function processStoredSettings(config) {
            sdes.config = config;
            callback();
        }
    );
}

function renderGitHubPage(rule, page) {
    // If page is null, it means we don't know how to proceed so stop here
    if ( page === null )
        return;

    if ( page.type === "org" || page.search )
        return;   // Not supporting for now
    else if ( page.type === "repo" )
        renderRepoPage();
    else
        throw("Error: Unrecognized GitHub page type '"+page.type+"'");

    function renderRepoPage() {
        var htmlUtil        = new sdes.utils.html(),
            containers      = document.getElementsByClassName("container"),
            pageHead        = document.getElementsByClassName("pagehead")[0],
            header          = containers[0],
            stopAnimation   = false,
            renderTo        = null,
            githubRepo      = null,
            githubRepoError = null,
            insightTab      = null;

        if ( page.tabs !== undefined )
            insightTab = addInsightTab();

        if ( page.show ) 
            renderTo = createGitSenseBody();
        else
            fixHeader();

        new sdes.gitsense.data.insight(rule).stat(
            rule.host.type,
            page.owner,
            page.repo,
            function(numIndexedBranches, numIndexedRepos, error) {
                stopAnimation = true;

                if ( error !== undefined )
                    throw error.responseText;

                $(insightTab.counter).html(
                    Number(numIndexedBranches).toLocaleString("en")
                );

                if ( ! page.show )
                    return;

                var hostId = rule.host.type;

                var params = {
                    id: "main",
                    iframeSrc: 
                        rule.gitsense.baseUrl+"/"+
                        "insight/"+
                        hostId+"?"+
                        "e=true&"+
                        "r="+page.owner+"/"+page.repo,
                    targetOrigin: rule.gitsense.baseUrl,
                    hash: window.location.hash,
                    height: "500px",
                    baseUrl: window.location.origin 
                };

                $(renderTo).html("");
                renderGitSense(renderTo, rule, params);
            }
        );

        new sdes.github.data.repo(rule).get(
            page.owner, 
            page.repo,
            function(repo, error){ 
                if ( error !== undefined ) {
                    githubRepoError = JSON.parse(error.responseText);
                    return;
                }

                githubRepo = repo;
            }
        );

        function fixHeader() {
            header.style.width        = null;
            header.style.paddingLeft  = null;
            header.style.paddingRight = null;
        }

        function createGitSenseBody() {
            var renderTo = htmlUtil.createDiv(),
                container;

            for ( var i = 0; i < containers.length; i++ ) {
                if ( ! containers[i].className.match(/experiment-repo-nav/) )
                    continue;

                container = containers[i];
            }

            header.style.width        = "100%";
            header.style.paddingLeft  = "20px";
            header.style.paddingRight = "20px";

            container.parentNode.appendChild(renderTo);
            pageHead.style.marginBottom = "5px";

            var tabBody = page.tabs.parentNode;
            var infoBar = pageHead.children[0];

            tabBody.style.width       = "100%";
            tabBody.style.paddingLeft = "5px";

            infoBar.style.width        = "100%";
            infoBar.style.paddingLeft  = "20px";
            infoBar.style.paddingRight = "20px";

            var dots = 
                    htmlUtil.createSpan({
                        style: {
                            marginLeft: "5px"
                        }
                    }),

                h3 = 
                    htmlUtil.createHeader3({
                        append: [ 
                            htmlUtil.createTextNode("Loading GitSense Insight "),
                            dots
                        ]
                    }),

                loadBody = 
                    htmlUtil.createDiv({
                        append: [ h3 ],
                        style: {
                            color: "#333",
                            padding: "30px",
                            paddingTop: "50px"
                        }
                    });

            renderTo.appendChild(loadBody);

            var stopAt = new Date().getTime() + 2000;

            checkForOctotree();

            animate(1);

            return renderTo;

            function animate(numDots) {
                if ( stopAnimation )
                    return;

                if ( numDots > 20 )
                    numDots = 1;

                var text = ".";

                for ( var i = 1; i <= numDots; i++ )
                    text += " .";

                $(dots).text(text);

                setTimeout(function(){ animate(numDots + 1); }, 250);
            }

            function checkForOctotree() {
                if ( new Date().getTime() > stopAt )  
                    return;

                var elems = document.getElementsByClassName("octotree_toggle");

                if ( elems === null || elems.length === 0 ) {
                    setTimeout(checkForOctotree, 100);
                    return;
                }

                header.style.paddingLeft  = "45px";
            }
        }

        function addInsightTab() {
            var needToAdd   = true,
                graphsTab   = null,
                pullReqsTab = null,
                projectsTab = null,
                wikiTab     = null;

            for ( var i = 0; i < page.tabs.children.length; i++ ) {
                var tab = page.tabs.children[i];

                if ( tab.className === "" ) 
                    tab = tab.children[0];

                if ( $(tab).html().match(/Graphs/) )    
                    graphsTab = tab;
                else if ( $(tab).html().match(/Pull/) )    
                    pullReqsTab = tab;
                else if ( $(tab).html().match(/Wiki/) )    
                    wikiTab = tab;
                else if ( $(tab).html().match(/Projects/) )    
                    projectsTab = tab;
                else if ( $(tab).html().match(/Insight/) )
                    tab.parentNode.removeChild(tab);

                if ( ! page.show )
                    continue;

                if ( tab.className.match(/ selected/) )
                    tab.setAttribute("class", tab.className.replace(/ selected/, ""));
            }

            var label =
                    htmlUtil.createSpan({
                        html: "<span class='octicon octicon-light-bulb'></span> "+
                              "Insight ",
                    }),
                counter = 
                    htmlUtil.createSpan({
                        cls: "counter",
                        html: "&nbsp; &nbsp"
                    }),
                insightTab = htmlUtil.createLink({
                    id: "gitsense-tab",
                    cls: "js-selected-navigation-item reponav-item"+
                         (page.show ? " selected" : ""),
                    href: "/"+page.owner+"/"+page.repo+"?gitsense=insight",
                    //href: 
                    //    rule.gitsense.baseUrl+"/insight/"+
                    //    rule.host.type+"?r="+page.owner+"/"+page.repo,
                    append: [ label, counter ],
                    style: {
                        cursor: "pointer"
                    }
                });

            insightTab.counter = counter;

            if ( graphsTab !== null )
                page.tabs.insertBefore(insightTab, graphsTab.nextSibling);
            else if ( wikiTab !== null )
                page.tabs.insertBefore(insightTab, wikiTab.nextSibling);
            else if ( projectsTab !== null )
                page.tabs.insertBefore(insightTab, projectsTab.nextSibling);
            else
                page.tabs.appendChild(insightTab);

            return insightTab;
        }
    }
} 

function renderGitLabPage(rule, page) {
    // If page is null, it means we don't know how to proceed so stop here
    if ( page === null )
        return;

    if ( page.type === "repo" )
        renderRepoPage();
    else if ( page.type === "search" )
        return;  // Not supporting for now
    else
        throw("Unrecognized GitLab page '"+page.type+"'");

    function renderRepoPage() {
        var htmlUtil        = new sdes.utils.html(),
            stopAnimation   = false,
            renderTo        = null,
            gitlabRepo      = null,
            gitlabRepoError = null,
            insightNavLink  = null;

        if ( page.navLinks !== undefined )
            insightNavLink = addInsightNavLink();

        if ( page.show ) {
            $(page.content).hide();

            // Hide the subnavs, if they exists. Note we are starting at 1
            for ( var i = 1; i < page.navLinks.length; i++ )
                $(page.navLinks[i]).hide();

        } else {
            $(page.content).show();

            // Show the subnavs, if they exists. Note we are starting at 1
            for ( var i = 1; i < page.navLinks.length; i++ )
                $(page.navLinks[i]).show();

        }
        
        if ( page.show ) 
            renderTo = createGitSenseBody();
        else if ( page.blame !== null ) 
            updateBlameCommits();

        new sdes.gitsense.data.insight(rule).stat(
            rule.host.type,
            page.owner,
            page.repo,
            function(numIndexedBranches, numIndexedRepos, error) {
                stopAnimation = true;

                if ( error !== undefined ) {
                    if (
                        error.responseText.toLowerCase() !== "unauthorized" &&
                        ! error.responseText.match(/access token/) && 
                        ! error.responseText.match(/No route to host/)
                    ) {
                        throw error.responseText;
                    }

                    if ( error.responseText.match(/No route to host/) )
                        renderNoRouteToHost(renderTo, error.responseText);
                    else
                        renderUnauthorized("gitlab", renderTo, rule, page);

                    return;
                }

                $(insightNavLink.badge).html(
                    Number(numIndexedBranches).toLocaleString("en")
                );

                if ( ! page.show )
                    return;

                var hostId = rule.host.type;

                var params = {
                    id: "main",
                    iframeSrc: 
                        rule.gitsense.baseUrl+"/"+
                        "insight/"+
                        hostId+"?"+
                        "e=true&"+
                        "r="+page.owner+"/"+page.repo,
                    targetOrigin: rule.gitsense.baseUrl,
                    hash: window.location.hash,
                    height: "500px",
                    baseUrl: window.location.origin 
                };

                $(renderTo).html("");
                renderGitSense(renderTo, rule, params);
            }
        );

        function createGitSenseBody() {
            var renderTo = htmlUtil.createDiv();

            var dots = 
                    htmlUtil.createSpan({
                        style: {
                            marginLeft: "5px"
                        }
                    }),

                h3 = 
                    htmlUtil.createHeader3({
                        append: [ 
                            htmlUtil.createTextNode("Loading GitSense Insight "),
                            dots
                        ]
                    }),

                loadBody = 
                    htmlUtil.createDiv({
                        append: [ h3 ],
                        style: {
                            color: "#333",
                            padding: "30px",
                            paddingTop: "50px"
                        }
                    });

            renderTo.appendChild(loadBody);
    
            page.content.parentNode.appendChild(renderTo);

            var stopAt = new Date().getTime() + 2000;

            animate(1);

            return renderTo;

            function animate(numDots) {
                if ( stopAnimation )
                    return;

                if ( numDots > 20 )
                    numDots = 1;

                var text = ".";

                for ( var i = 1; i <= numDots; i++ )
                    text += " .";

                $(dots).text(text);

                setTimeout(function(){ animate(numDots + 1); }, 250);
            }

            function checkForOctotree() {
                if ( new Date().getTime() > stopAt )  
                    return;

                var elems = document.getElementsByClassName("octotree_toggle");

                if ( elems === null || elems.length === 0 ) {
                    setTimeout(checkForOctotree, 100);
                    return;
                }

                header.style.paddingLeft  = "45px";
            }
        }

        function addInsightNavLink() {
            var needToAdd  = true,
                graphsLink = null,
                issuesLink = null;

            for ( var i = 0; i < page.navLinks[0].children.length; i++ ) {
                var link = page.navLinks[0].children[i];

                if ( $(link).text().match(/Graphs/) )    
                    graphsLink = link;
                else if ( $(link).text().match(/Issues/) )    
                    issuesLink = link;
                else if ( $(link).html().match(/Insight/) )
                    link.parentNode.removeChild(link);

                if ( ! page.show )
                    continue;

                if ( link.className.match(/ active/) )
                    link.setAttribute("class", link.className.replace(/ active/, ""));
            }

            var label =
                    htmlUtil.createSpan({
                        text: "Insight ",
                    }),
                badge = 
                    htmlUtil.createSpan({
                        cls: "badge",
                        html: "&nbsp; &nbsp"
                    }),
                insightNavLink = htmlUtil.createLink({
                    title: "GitSense Insight",
                    cls: "shortcuts-graphs",
                    append: [ label, badge ],
                    href: "/"+page.owner+"/"+page.repo+"?gitsense=insight"
                });

            insightNavLink.badge = badge;

            var list = htmlUtil.createList({
                cls: (page.show ? " active" : ""),
                append: [ insightNavLink ],
            });

            if ( graphsLink !== null )
                page.navLinks[0].insertBefore(list, graphsLink.nextSibling);
            else if ( issuesLink !== null )
                page.navLinks[0].insertBefore(list, issuesLink);
            else
                page.navLinks[0].appendChild(list);

            return insightNavLink;
        }

        function updateMergeCommitsLinks(startedAt) {
            if ( rule.host.xFrameOptions === undefined || rule.host.xFrameOptions === "DENY" )
                return;

            if ( startedAt === undefined )
                startedAt = new Date().getTime();
            else if ( new Date().getTime() - startedAt > 5000 )
                throw("Couldn't find any commit links, giving up");

            var titles     = document.getElementsByClassName("commit-row-message"),
                shortLinks = document.getElementsByClassName("commit-short-id");

            if ( titles.length === 0 ) {
                setTimeout(function(){ updateMergeCommitsLinks(startedAt); }, 100);
                return;
            }

            for ( var i = 0; i < titles.length; i++ ) {
                var title = titles[i];

                if ( title.tagName !== "A" )
                    continue;

                updateLink(title);
            }

            function updateLink(link) {
                var href = link.href;

                link.removeAttribute("href");
                link.style.cursor = "pointer";

                link.onclick = function()  {
                    openGitSenseWindow(href);
                }
            }
        }

        function updateBlameCommits() {
            var stop = page.blame.commitElems.length,
                halt = false;

            for ( var i = 0; i < stop; i++ ) {
                addIcons(page.blame.commitElems[i*3]);

                if ( halt )
                    break;
            }

            function addIcons(elem) {
                if ( elem.childNodes.length !== 3 ) {
                    console.warn("Don't know how to parse the following element");
                    console.dir(elem);
                    halt = true;
                    return;
                }

                var commitLink = elem.childNodes[1];

                if ( commitLink.tagName !== "A" ) {
                    console.warn("Don't know how to parse the following element");
                    console.dir(elem);
                    halt = true;
                    return;
                }

                var commit    = commitLink.href.split("/").pop(),
                    repo      = page.owner+"/"+page.repo,
                    host      = rule.host.type,
                    branchId  = host+":"+repo+":"+page.blame.branch,
                    path      = page.blame.path,
                    query     = "head:"+commit+"+path:"+path+"+follow:true";

                var bolt = htmlUtil.createLink({
                    cls: "fa fa-bolt pull-right",
                    style: {
                        fontSize: "12px",
                        position: "relative",
                        top: "5px",
                        marginLeft: "5px",
                        cursor: "pointer"
                    }
                });

                var history = htmlUtil.createLink({
                    cls: "fa fa-history pull-right",
                    href:  "/"+repo+"?gitsense=insight&r="+repo+"#b="+branchId+"&q="+query,
                    style: {
                        fontSize: "12px",
                        position: "relative",
                        top: "5px",
                        marginLeft: "5px",
                        cursor: "pointer"
                    }
                });

                elem.parentNode.insertBefore(bolt, elem);
                elem.parentNode.insertBefore(history, elem);

                bolt.onclick = function() {
                    var href =
                        rule.gitsense.baseUrl+"/"+
                        "insight/"+
                        host+
                        "?"+
                        "dw=true&"+
                        "r="+repo+"&"+
                        "#"+
                        "b="+branchId+"&"+
                        "q="+query+"&"+
                        "dr=history&"+
                        "dp="+path+"&"+
                        "dc=false&"+
                        "dcl=&df=&dl=&dvm=";

                    openGitSenseWindow(href);
                }
            }
        }
    }
}

function renderGitSense(renderTo, rule, params) {
    if ( gitsenseIframe === null )
        gitsenseIframe = document.getElementById("gitsense-content-iframe");

    if ( gitsenseIframe !== null ) {
        gitsenseIframe.parentNode.removeChild(gitsenseIframe);
        window.addEventListener("message", receiveMessage, false);
        lastHeight = null;
    }

    gitsenseIframe = document.createElement("iframe");

    gitsenseIframe.id           = gitsenseFrameId;
    gitsenseIframe.src          = chrome.runtime.getURL("frame.html");
    gitsenseIframe.style.width  = "100%";
    gitsenseIframe.style.height = "500px";
    gitsenseIframe.style.border = 0;

    renderTo.appendChild(gitsenseIframe);

    var msg = JSON.stringify(params);

    var stopAt = new Date().getTime()+2000;

    setTimeout(render, 100);

    function render() {
        if ( new Date().getTime() > stopAt )
            return;

        if ( gitsenseIframe !== null && gitsenseIframe.contentWindow !== null )
            gitsenseIframe.contentWindow.postMessage(msg, "*");

        // Do not remove the timeout.  The iframe knows when to ignore our messages.
        setTimeout(render, 50);
    }
}

function receiveMessage(event) {
    var temp1 = event.data.split(":::::");

    if ( temp1.length !== 2 ) 
        return;

    var temp2  = temp1[1].split(":"),
        sender = temp1[0],
        key    = temp2[0],
        value  = temp1[1].replace(/^[^:]+:/, ""),
        rule   = new sdes.utils.config().getRule();

    if ( sender !== "main" )
        return;

    if ( 
        key.toLowerCase() === "gswin" && 
        ( rule.host.xFrameOptions === undefined || rule.host.xFrameOptions === "DENY" )
    ) {
        var url = new URL(value);

        if ( url.origin === window.location.origin )
            key = "href";
    } 

    if ( key === "height")
        setHeight(parseInt(value));
    else if ( key === "hash" )
        setHash(value);
    else if ( key === "href" ) 
        setHref(value);
    else if ( key === "page" )
        gotoPage(value);
    else if ( key.toLowerCase() === "gswin" )
        openGitSenseWindow(value, key === "GSWIN" ? true : false);
    else if ( key === "reload" )
        window.location.reload();
    else
        console.log("Ignoring "+event.data);
}

function setHeight(height) {
    if ( height === lastHeight )
        return;

    gitsenseIframe.style.height = height+"px";
    lastHeight = height;
}

function gotoPage(page) {
    var href = window.location.href.replace(/\?.+/, "?gitsense=insight#"+page);
    window.location.href = href; 
}

function setHash(hash) {
    ignoreHash = hash;

    if ( window.location.hash !== hash )
        window.location.hash = hash;
}

function setHref(href) {
    var url = null;

    try {
        url = new URL(href);
    } catch ( e ) {
        throw(
            "The following exception was thrown while trying to "+
            "construct a URL based on '"+href+"':\n"+e
        );
    }

    var isGitSenseUrl =
            currentRule === null ?
                null 
                : 
                new URL(currentRule.gitsense.baseUrl).origin === url.origin || 
                href.match(/https:\/\/gitsense.com/) ? 
                    true : 
                    false;

    if ( url.origin !== window.location.origin && ! isGitSenseUrl ) {
        console.warn("INVALID GITSENSE URL: Ignoring set href request for \""+href+"\"");
        return;
    }

    window.location.href = href;
}

function openGitSenseWindow(href, max) {
    if ( overlayWindow !== null ) 
        overlayWindow.parentNode.removeChild(overlayWindow);

    if ( resize !== null )
        resize.parentNode.removeChild(resize);

    var url = new URL(href),
        win = createOverlayWindow(href, "*", max);

    win.iframe.src = chrome.runtime.getURL("frame.html");

    var params = {
        id: "overlay", 
        iframeSrc: url.href.replace(/#.+/, ""), 
        targetOrigin: url.origin, 
        hash: url.hash 
    };

    var msg    = JSON.stringify(params),
        stopAt = new Date().getTime() + 2000;
        
    setTimeout(render, 100);

    function render() {
        if ( new Date().getTime() > stopAt )
            return;

        win.iframe.contentWindow.postMessage(msg, "*");

        // Do not remove the timeout.  The iframe knows when to ignore our messages.
        setTimeout(render, 50);
    }
}

function createOverlayWindow(href, targetOrigin, max) {
    var width       = window.innerWidth - 30,
        height      = window.innerHeight - 25,
        _peekWidth  = max ? 15 : peekWidth,
        titleHeight = 30;

    if ( 
        _peekWidth === origPeekWidth && 
        width - _peekWidth < 1100 &&
        width - 1100 > 0 
    ) {
        _peekWidth = width - 1100;
    }

    overlayWindow = document.createElement("body");
    overlayWindow.style.width  = (width - _peekWidth)+"px";
    overlayWindow.style.height = height+"px";
    overlayWindow.style.backgroundColor = "white";
    overlayWindow.style.zIndex = 1000000;
    overlayWindow.style.position = "fixed";
    overlayWindow.style.top = 10+"px";
    overlayWindow.style.left = _peekWidth+"px";
    overlayWindow.style.border = "0px";
    overlayWindow.style.boxShadow = "0px 0px 26px 0px rgba(48,48,48,1)";
    overlayWindow.style.overflow = "hidden";

    var title = document.createElement("div");
    title.style.backgroundColor = "black";
    title.style.height = titleHeight+"px";
    title.style.display = "table";
    title.style.fontSize = "12px";
    title.style.color = "white";

    var externalLink = document.createElement("a");
    externalLink.setAttribute("class", "octicon octicon-link-external");
    externalLink.setAttribute("title", "Open in current window");
    externalLink.href = href;
    externalLink.target = "_blank";
    externalLink.style.fontWeight = "bold";
    externalLink.style.display = "block";
    externalLink.style.overflow = "hidden";
    externalLink.style.textOverflow = "ellipsis";
    externalLink.style.whiteSpace = "nowrap";
    externalLink.style.color = "white";

    var externalLinkCell = document.createElement("div");
    externalLinkCell.style.display = "table-cell";
    externalLinkCell.style.verticalAlign = "middle";
    externalLinkCell.style.paddingRight = "15px";
    externalLinkCell.style.paddingTop = "1px";
    externalLinkCell.appendChild(externalLink);

    var gotoLinkText = document.createTextNode(href);
    var gotoLink = document.createElement("a");
    gotoLink.setAttribute("title", "Open in new window");
    gotoLink.href = href;
    gotoLink.style.fontWeight = "bold";
    gotoLink.style.display = "block";
    gotoLink.style.width = "500px";
    gotoLink.style.overflow = "hidden";
    gotoLink.style.textOverflow = "ellipsis";
    gotoLink.style.whiteSpace = "nowrap";
    gotoLink.style.color = "white";
    gotoLink.appendChild(gotoLinkText);

    var gotoLinkCell = document.createElement("div");
    gotoLinkCell.style.display = "table-cell";
    gotoLinkCell.style.width = "100%";
    gotoLinkCell.style.verticalAlign = "middle";
    gotoLinkCell.style.paddingLeft = "15px";
    gotoLinkCell.style.paddingTop = "1px";
    gotoLinkCell.style.fontFamily = "monospace";
    gotoLinkCell.appendChild(gotoLink);

    var close = document.createElement("span");
    close.setAttribute("class", "octicon octicon-x");
    close.style.marginRight = "10px";
    close.style.cursor = "pointer";
    close.style.fontWeight = "bold";

    var closeCell = document.createElement("div");
    closeCell.style.display = "table-cell";
    closeCell.style.verticalAlign = "middle";
    closeCell.appendChild(close);

    var size = document.createElement("span");
    size.setAttribute("class", "octicon octicon-plus");
    size.setAttribute("title", "Increase window width");
    size.style.marginRight = "15px";
    size.style.cursor = "pointer";
    size.style.fontWeight = "bold";

    var sizeCell = document.createElement("div");
    sizeCell.style.display = max ? "none" : "table-cell";
    sizeCell.style.verticalAlign = "middle";
    sizeCell.appendChild(size);

    title.appendChild(gotoLinkCell);
    title.appendChild(externalLinkCell);
    title.appendChild(sizeCell);
    title.appendChild(closeCell);

    var iframe = document.createElement("iframe");
    iframe.style.border = "0px";
    iframe.style.width  = "100%";
    iframe.style.height = (height - titleHeight)+"px";

    overlayWindow.appendChild(title);
    overlayWindow.appendChild(iframe);

    document.body.appendChild(overlayWindow);

    resize                = document.createElement("div");
    resize.style.position = "fixed";
    resize.style.left     = (parseInt(overlayWindow.style.left) - 2)+"px";
    resize.style.top      = overlayWindow.style.top;
    resize.style.height   = overlayWindow.style.height;
    resize.style.width    = "5px";
    resize.style.cursor   = "col-resize";
    resize.style.zIndex   = overlayWindow.style.zIndex+1;
    resize.style.backgroundColor = "transparent";

    document.body.appendChild(resize);

    var screen = null;

    resize.onmousedown = function(e) {
        screen = document.createElement("div");
        screen.style.width  = window.innerWidth+"px";
        screen.style.height = window.innerHeight+"px"; 
        screen.style.position = "fixed";
        screen.style.top    = 0;
        screen.style.left   = 0;
        screen.style.zIndex = overlayWindow.style.zIndex+1;
        screen.style.backgroundColor = "white";
        screen.style.cursor  = "col-resize";
        screen.style.opacity = .3;
        document.body.appendChild(screen);

        var box = document.createElement("div");
        box.style.position = "fixed";
        box.style.left     = (parseInt(overlayWindow.style.left) - 2)+"px";
        box.style.top      = overlayWindow.style.top;
        box.style.height   = parseInt(overlayWindow.style.height)+"px";
        box.style.width    = (parseInt(overlayWindow.style.width) - 6)+"px";
        box.style.cursor   = "col-resize";
        box.style.border   = "2px solid #333";

        screen.appendChild(box);

        screen.onmousemove = function(e) {
            var diff = parseInt(resize.style.left) - e.clientX;
            box.style.width = (parseInt(overlayWindow.style.width)+diff)+"px";
            box.style.left  = e.clientX+"px";
        }

        screen.onmouseup = function(e) {
            screen.parentNode.removeChild(screen);
            screen = null;

            var diff = parseInt(resize.style.left) - e.clientX;
            overlayWindow.style.width = (parseInt(overlayWindow.style.width)+diff)+"px";
            overlayWindow.style.left  = e.clientX+"px";
            resize.style.left = e.clientX+"px";
            iframe.contentWindow.postMessage("resize", targetOrigin);
            peekWidth = e.clientX;
        }
    }

    close.onclick = function() {
        overlayWindow.parentNode.removeChild(overlayWindow);
        overlayWindow = null;
        resize.parentNode.removeChild(resize);
        resize = null;
    }

    size.onclick = function() {
        var expand = size.className.match(/dash/) ? false : true;

        if ( expand ) {
            resize.style.left         = "15px";
            overlayWindow.style.left  = "15px";
            overlayWindow.style.width = (width - 15)+"px";
            size.setAttribute("class", size.className.replace("plus", "dash"));
            size.setAttribute("title", "Shrink window width");
        } else {
            resize.style.left         = _peekWidth+"px";
            overlayWindow.style.left  = _peekWidth+"px";
            overlayWindow.style.width = (width - _peekWidth)+"px";
            size.setAttribute("class", size.className.replace("dash", "plus"));
            size.setAttribute("title", "Increase window width");
        }

        iframe.contentWindow.postMessage("resize", targetOrigin);
    }

    return { title: title, iframe: iframe };
}

function renderNoRouteToHost(renderTo, error) {
    $(renderTo).html(
        "<div style='padding:30px;padding-top:10px;width:800px;line-height:1.5;font-size:18px;'>"+
            "<h2>No route to host</h2>"+
            "<p>"+
                "The GitSense server returned the following error:\n"+
            "</p>"+
            "<pre style='margin-top:20px'>"+error+"</pre>"+
            "<p>"+
                "Are your settings correct?&nbsp; "+
                "To update the browser's GitSense settings, copy and the paste the following URI:"+
            "</p>"+
            "<pre style='margin-top:20px'>chrome-extension://"+chrome.runtime.id+"/options.html</pre>"+
        "</div>"
    );
}

function renderUnauthorized(type, renderTo, rule, page) {
    var token = type.match("gitlab") ? "GitLab access token" : "GitHub personal token";

    $(renderTo).html(
        "<div style='padding:30px;padding-top:10px;width:800px;line-height:1.5;'>"+
            "<h2>Unauthorized</h2>"+
            "<p style='font-size:18px;'>"+
                "Sorry, we were unable to verify your identity on the GitSense server at "+
                rule.gitsense.baseUrl+"&nbsp; "+
                "Please add a GitSense access token and/or "+token+" to your "+
                "browser's GitSense settings and try again.&nbsp; To access the GitSense settings "+
                "page, copy and the paste the following URI:"+
            "</p>"+
            "<pre style='margin-top:20px'>chrome-extension://"+chrome.runtime.id+"/options.html</pre>"+
        (
            type === "github"  ?
                "" :
                "<p style='font-size:18px;margin-top:20px;'>"+
                    "Alternatively, if you have GitSense admin privileges, you can setup a common GitLab "+
                    "access token on the GitSense server."+
                "</p>"
        )+
        "</div>"
    );
}

